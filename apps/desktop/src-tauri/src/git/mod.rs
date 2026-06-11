//! Git backup/sync primitives (Plan 12).
//!
//! Rust owns the *capabilities* — init/adopt, commit, fetch, merge, push —
//! while the sync **policy** (debounce cadence, retry loop, product states,
//! GitHub specifics) lives in `@reflect/core` `sync/`. Nothing here is
//! GitHub-specific: remotes are URLs, credentials arrive per call through a
//! callback (never embedded in the URL, so never on disk).
//!
//! All operations run on blocking threads (network fetches/pushes take
//! seconds) and are generation-gated like file writes: a command issued for
//! one graph must never act on another after a switch.

mod commit;
mod merge;
mod remote;
mod repo;
#[cfg(test)]
mod tests;

use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::fs::GraphState;

use self::commit::CommitOutcome;
use self::merge::MergeOutcome;
use self::remote::{PushOutcome, RemoteDelta};

/// GitHub rejects files over 100 MB, failing the whole push; stop just under.
const MAX_FILE_BYTES: u64 = 95 * 1024 * 1024;

/// Snapshot of the graph's backup repository for the UI and the sync engine.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// Whether the graph has a repository at all (backup set up).
    pub initialized: bool,
    pub branch: Option<String>,
    pub remote_url: Option<String>,
    /// Graph-relative paths with uncommitted changes (untracked included).
    pub dirty_paths: Vec<String>,
    /// Commits ahead/behind the last-fetched remote branch (no network).
    pub ahead: usize,
    pub behind: usize,
    /// A merge/rebase the user started outside Reflect is in progress.
    pub in_progress: bool,
}

fn status(root: &Path) -> AppResult<GitStatus> {
    if !root.join(".git").exists() {
        return Ok(GitStatus {
            initialized: false,
            branch: None,
            remote_url: None,
            dirty_paths: Vec::new(),
            ahead: 0,
            behind: 0,
            in_progress: false,
        });
    }
    let repo = repo::open_existing(root)?;
    let branch = repo::current_branch(&repo).ok();
    let remote_url = repo
        .find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().ok().map(str::to_string));
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let dirty_paths = repo
        .statuses(Some(&mut opts))?
        .iter()
        .filter_map(|entry| entry.path().ok().map(str::to_string))
        .collect();
    let delta = remote::local_delta(&repo).unwrap_or(RemoteDelta {
        ahead: 0,
        behind: 0,
    });
    Ok(GitStatus {
        initialized: true,
        branch,
        remote_url,
        dirty_paths,
        ahead: delta.ahead,
        behind: delta.behind,
        in_progress: repo.state() != git2::RepositoryState::Clean,
    })
}

fn setup(root: &Path, remote_url: Option<String>, branch: Option<String>) -> AppResult<GitStatus> {
    let repo = repo::open_or_init(root)?;
    repo::ensure_reflect_ignored(root)?;
    if let Some(url) = remote_url {
        if repo.find_remote("origin").is_ok() {
            repo.remote_set_url("origin", &url)?;
        } else {
            repo.remote("origin", &url)?;
        }
    }
    if let Some(branch) = branch {
        repo::align_branch(&repo, &branch)?;
    }
    drop(repo);
    status(root)
}

async fn run_blocking<T, F>(task: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|err| AppError::io(format!("git task panicked: {err}")))?
}

/// Snapshot the backup repository (cheap, no network).
#[tauri::command]
pub async fn git_status(state: State<'_, GraphState>) -> AppResult<GitStatus> {
    let root = crate::fs::current_root(&state)?;
    run_blocking(move || status(&root)).await
}

/// Initialize (or adopt) the graph's repository, optionally point `origin` at
/// `remote_url`, and align the local branch with `branch` (the remote's
/// default — fetch/merge/push must target the branch the backup repo actually
/// uses, e.g. an existing repo on `master` while fresh graphs init `main`).
/// Idempotent.
#[tauri::command]
pub async fn git_setup(
    remote_url: Option<String>,
    branch: Option<String>,
    generation: u64,
    state: State<'_, GraphState>,
) -> AppResult<GitStatus> {
    let root = crate::fs::root_for_generation(&state, generation)?;
    run_blocking(move || setup(&root, remote_url, branch)).await
}

/// Commit every pending change (no-op when clean). See [`commit::commit_all`].
#[tauri::command]
pub async fn git_commit_all(
    message: String,
    generation: u64,
    state: State<'_, GraphState>,
) -> AppResult<CommitOutcome> {
    let root = crate::fs::root_for_generation(&state, generation)?;
    run_blocking(move || commit::commit_all(&root, &message, MAX_FILE_BYTES)).await
}

/// Fetch `origin` and report ahead/behind for the current branch.
#[tauri::command]
pub async fn git_fetch(
    token: Option<String>,
    generation: u64,
    state: State<'_, GraphState>,
) -> AppResult<RemoteDelta> {
    let root = crate::fs::root_for_generation(&state, generation)?;
    run_blocking(move || remote::fetch(&root, token)).await
}

/// Merge the fetched remote branch; conflicts are committed into the notes as
/// labeled markers (see [`merge`]). The repo is never left mid-merge.
#[tauri::command]
pub async fn git_merge_remote(
    generation: u64,
    state: State<'_, GraphState>,
) -> AppResult<MergeOutcome> {
    let root = crate::fs::root_for_generation(&state, generation)?;
    run_blocking(move || merge::merge_remote(&root)).await
}

/// Push the current branch to `origin`; rejections come back as data so the
/// sync engine can branch on them.
#[tauri::command]
pub async fn git_push(
    token: Option<String>,
    generation: u64,
    state: State<'_, GraphState>,
) -> AppResult<PushOutcome> {
    let root = crate::fs::root_for_generation(&state, generation)?;
    run_blocking(move || remote::push(&root, token)).await
}

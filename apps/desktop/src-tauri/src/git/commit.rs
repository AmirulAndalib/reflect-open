//! Stage-everything commit with the large-file guardrail.

use std::cell::RefCell;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;

use git2::{Index, IndexAddOption};
use serde::Serialize;

use crate::error::{AppError, AppResult};

use super::repo::{ensure_clean_state, open_existing, signature};

const LOCK_RETRY_DELAY: Duration = Duration::from_millis(250);
const LOCK_RETRIES: usize = 3;

#[cfg(not(test))]
const STALE_INDEX_LOCK_AGE: Duration = Duration::from_secs(30);

#[cfg(test)]
const STALE_INDEX_LOCK_AGE: Duration = Duration::from_secs(0);

/// A file whose *changes* were withheld from staging because it is at/above
/// the size guardrail. Oversized-but-unchanged files are not reported — their
/// old version is already in the backup.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    /// Graph-relative path (forward-slashed) of the withheld file.
    pub path: String,
    pub size: u64,
}

/// Result of a commit attempt. `committed: false` means the tree was clean.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitOutcome {
    pub committed: bool,
    pub sha: Option<String>,
    /// Commits the local branch is ahead of the last-fetched remote (no
    /// network). The sync engine skips the push entirely when a debounced
    /// pass finds nothing committed and nothing ahead — pull-applied watcher
    /// events would otherwise buy a pointless network negotiation each time.
    pub ahead: usize,
    pub skipped_large_files: Vec<SkippedFile>,
}

/// Stage every change under the graph and commit. Returns `committed: false`
/// when the staged tree already matches HEAD — the sync engine uses that
/// (with `ahead`) to skip the network entirely, which is what makes the loop
/// safe: pull-applied writes match HEAD and produce no-ops.
pub(super) fn commit_all(
    root: &Path,
    message: &str,
    max_file_bytes: u64,
) -> AppResult<CommitOutcome> {
    for attempt in 0..=LOCK_RETRIES {
        match commit_all_once(root, message, max_file_bytes) {
            Ok(outcome) => return Ok(outcome),
            Err(error) if is_index_lock_error(&error) => {
                if remove_stale_index_lock(root)? {
                    continue;
                }
                if attempt < LOCK_RETRIES {
                    thread::sleep(LOCK_RETRY_DELAY);
                    continue;
                }
                return Err(index_lock_error(root));
            }
            Err(error) => return Err(error),
        }
    }
    Err(index_lock_error(root))
}

fn commit_all_once(root: &Path, message: &str, max_file_bytes: u64) -> AppResult<CommitOutcome> {
    let repo = open_existing(root)?;
    ensure_clean_state(&repo)?;

    let mut index = repo.index()?;
    let skipped = add_all_with_size_guard(&mut index, root, max_file_bytes)?;

    let parent = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
    if parent.is_none() && index.is_empty() {
        return Ok(CommitOutcome {
            committed: false,
            sha: None,
            ahead: ahead_of_remote(&repo),
            skipped_large_files: skipped,
        });
    }

    let tree_id = index.write_tree()?;
    if let Some(parent) = &parent {
        if parent.tree_id() == tree_id {
            return Ok(CommitOutcome {
                committed: false,
                sha: None,
                ahead: ahead_of_remote(&repo),
                skipped_large_files: skipped,
            });
        }
    }

    let tree = repo.find_tree(tree_id)?;
    let sig = signature(&repo)?;
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    let oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)?;
    Ok(CommitOutcome {
        committed: true,
        sha: Some(oid.to_string()),
        ahead: ahead_of_remote(&repo),
        skipped_large_files: skipped,
    })
}

fn is_index_lock_error(error: &AppError) -> bool {
    match error {
        AppError::Io { message } => {
            let message = message.to_lowercase();
            message.contains("index is locked") || message.contains("index.lock")
        }
        _ => false,
    }
}

fn remove_stale_index_lock(root: &Path) -> AppResult<bool> {
    let repo = open_existing(root)?;
    let lock_path = repo.path().join("index.lock");
    let metadata = match fs::metadata(&lock_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.into()),
    };
    let Ok(modified) = metadata.modified() else {
        return Ok(false);
    };
    let Ok(age) = modified.elapsed() else {
        return Ok(false);
    };
    if age < STALE_INDEX_LOCK_AGE {
        return Ok(false);
    }
    match fs::remove_file(&lock_path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn index_lock_error(root: &Path) -> AppError {
    let lock_path = open_existing(root)
        .map(|repo| repo.path().join("index.lock"))
        .unwrap_or_else(|_| root.join(".git/index.lock"));
    AppError::io(format!(
        "Git is still holding the backup index lock. Close any Git command using this graph and try again. If Reflect crashed earlier, remove {} once no Git command is running.",
        lock_path.display()
    ))
}

/// Stage every change (adds, edits, deletes — `.gitignore` respected) into
/// `index` and write it, withholding files at/above `max_file_bytes`: GitHub
/// rejects >100 MB files and the rejection fails the *whole* push, so one
/// oversized video must not break backup for everything else. Returns the
/// files whose changes were withheld.
fn add_all_with_size_guard(
    index: &mut Index,
    root: &Path,
    max_file_bytes: u64,
) -> AppResult<Vec<SkippedFile>> {
    // Size + mtime already in the index, so the guard can tell "oversized and
    // unchanged" (skip silently — its old version is already backed up) from
    // "oversized changes being withheld" (skip and report). Size alone would
    // miss a same-length edit; matching git's own stat-based change detection
    // (mtime, at nanosecond precision where the index recorded it) closes
    // that without hashing gigabytes. When the index entry carries no nsec
    // component (libgit2 built without USE_NSEC), the comparison falls back
    // to whole seconds — a same-length edit inside that second is then
    // reported as withheld rather than silently matched, erring toward the
    // warning.
    let tracked_stats: std::collections::HashMap<String, (u32, i32, u32)> = index
        .iter()
        .map(|entry| {
            (
                String::from_utf8_lossy(&entry.path).into_owned(),
                (
                    entry.file_size,
                    entry.mtime.seconds(),
                    entry.mtime.nanoseconds(),
                ),
            )
        })
        .collect();

    let skipped: RefCell<Vec<SkippedFile>> = RefCell::new(Vec::new());
    let mut size_guard = |path: &Path, _spec: &[u8]| -> i32 {
        let Ok(meta) = root.join(path).metadata() else {
            // Deleted file: let the staging proceed so the removal is recorded.
            return 0;
        };
        if !meta.is_file() || meta.len() < max_file_bytes {
            return 0;
        }
        let rel = path.to_string_lossy().replace('\\', "/");
        let mtime = meta
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok());
        let (file_secs, file_nsecs) = mtime
            .map(|duration| (duration.as_secs() as i32, duration.subsec_nanos()))
            .unwrap_or((0, 0));
        let unchanged = match tracked_stats.get(&rel) {
            Some(&(size, secs, nsecs)) => {
                size == meta.len() as u32
                    && secs == file_secs
                    && (nsecs == 0 || nsecs == file_nsecs)
            }
            None => false,
        };
        let mut skipped = skipped.borrow_mut();
        if !unchanged && !skipped.iter().any(|file| file.path == rel) {
            skipped.push(SkippedFile {
                path: rel,
                size: meta.len(),
            });
        }
        1 // keep the oversized content out of the index either way
    };

    index.add_all(["*"], IndexAddOption::DEFAULT, Some(&mut size_guard))?;
    // add_all stages new + modified paths; update_all records deletions of
    // tracked files whose working copy is gone (and re-checks sizes for
    // tracked files that have since grown past the guardrail).
    index.update_all(["*"], Some(&mut size_guard))?;
    index.write()?;
    Ok(skipped.into_inner())
}

/// Ahead-count vs the last-fetched remote branch. When it can't be computed
/// it reports `1` so the engine errs toward pushing, never toward skipping.
fn ahead_of_remote(repo: &git2::Repository) -> usize {
    super::remote::local_delta(repo)
        .map(|delta| delta.ahead)
        .unwrap_or(1)
}

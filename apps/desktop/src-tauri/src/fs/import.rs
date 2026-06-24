//! Reflect V1 → V2 graph import (drag-and-drop onto the chooser).
//!
//! A V1 "Reflect Open folder" export is already V2's markdown shape (`daily/`,
//! `notes/`, `assets/`), so importing is a copy, not a transform: materialize
//! the dropped archive into a fresh graph under the user's Documents folder and
//! hand its path back for the normal open flow.
//!
//! The web layer can't give Rust a real filesystem path for a dropped *folder*
//! (WebKit hides it), so the frontend ships the *contents* — either the raw
//! `.zip` bytes ([`import_zip`]) or an enumerated file list ([`import_files`]).
//! Both converge on [`import_into`]. The `#[tauri::command]` wrappers that the
//! frontend invokes live in the parent [`super`] module.
//!
//! Imports are all-or-nothing: files land in a temp sibling of the final
//! destination, are validated (a real export has markdown under `daily/` or
//! `notes/`), and only then is the staging directory renamed into place. A drop
//! that isn't a Reflect graph writes nothing.

use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Deserialize;
use tauri::Manager;

use crate::error::{AppError, AppResult};

use super::io::{bootstrap, collect_files};

/// One file from an enumerated folder drop: a (forward-slashed) relative path
/// plus its base64-encoded bytes (JSON IPC can't carry raw binary).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    pub path: String,
    pub contents_base64: String,
}

/// Directory under Documents that holds imported graphs.
const IMPORTS_DIRNAME: &str = "Reflect";
/// Fallback graph name when the archive name sanitizes to nothing.
const FALLBACK_NAME: &str = "Reflect Graph";

/// Extract a dropped `.zip` (base64-encoded) into a fresh graph under
/// `~/Documents/Reflect/<name>` and return its absolute path. The frontend then
/// opens it through the normal graph-open flow.
pub(super) fn import_zip(name: &str, zip_base64: &str, app: &tauri::AppHandle) -> AppResult<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(zip_base64.as_bytes())
        .map_err(|err| AppError::io(format!("invalid base64 zip payload: {err}")))?;
    let entries = read_zip_entries(&bytes)?;
    let root = import_into(&imports_dir(app)?, name, entries)?;
    Ok(root.to_string_lossy().into_owned())
}

/// Materialize an enumerated folder drop (a dropped directory's contents) into a
/// fresh graph under `~/Documents/Reflect/<name>` and return its absolute path.
pub(super) fn import_files(
    name: &str,
    files: Vec<ImportFile>,
    app: &tauri::AppHandle,
) -> AppResult<String> {
    let mut entries = Vec::with_capacity(files.len());
    for file in files {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file.contents_base64.as_bytes())
            .map_err(|err| AppError::io(format!("invalid base64 file payload: {err}")))?;
        entries.push((file.path, bytes));
    }
    let root = import_into(&imports_dir(app)?, name, entries)?;
    Ok(root.to_string_lossy().into_owned())
}

/// `~/Documents/Reflect` — the parent directory imported graphs land in.
fn imports_dir(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|err| AppError::io(format!("no documents directory: {err}")))?;
    Ok(documents.join(IMPORTS_DIRNAME))
}

/// Build a graph from `entries` (relative path → bytes) at a unique
/// `<parent>/<name>` and return that path.
///
/// Staging-then-rename keeps the import atomic: cruft is skipped, a single
/// wrapping directory is stripped, the result is validated as a real export,
/// and only a valid graph is moved into place — a bad drop leaves nothing
/// behind (the [`tempfile::TempDir`] cleans itself up on the early return).
fn import_into(parent: &Path, name: &str, entries: Vec<(String, Vec<u8>)>) -> AppResult<PathBuf> {
    let prefix = wrapper_prefix(&entries);
    std::fs::create_dir_all(parent)?;
    let staging = tempfile::TempDir::new_in(parent)?;

    let mut wrote_any = false;
    for (path, bytes) in &entries {
        let Some(relative) = sanitized_relative(path, prefix.as_deref()) else {
            continue; // skipped (.reflect/, .git/, junk) or unsafe
        };
        write_file(&staging.path().join(relative), bytes)?;
        wrote_any = true;
    }

    if !wrote_any || !has_note_markdown(staging.path()) {
        return Err(AppError::not_found(
            "that doesn't look like a Reflect export — no notes found under daily/ or notes/",
        ));
    }

    // Fill in any missing standard layout (e.g. an export with only `notes/`).
    bootstrap(staging.path())?;

    let destination = unique_destination(parent, name);
    // Commit: keep the staged directory (disable auto-delete) and move it into
    // place. On a rename failure, remove the directory we just kept so a failed
    // import still leaves nothing behind.
    let staged = staging.keep();
    std::fs::rename(&staged, &destination).map_err(|err| {
        let _ = std::fs::remove_dir_all(&staged);
        AppError::io(format!("failed to finalize import: {err}"))
    })?;
    Ok(destination)
}

/// Decode a zip archive into `(relative path, bytes)` entries, skipping
/// directories. `enclosed_name` drops any zip-slip path (absolute or `..`).
fn read_zip_entries(bytes: &[u8]) -> AppResult<Vec<(String, Vec<u8>)>> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|err| AppError::io(format!("could not read the zip: {err}")))?;
    let mut entries = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|err| AppError::io(format!("could not read a zip entry: {err}")))?;
        if file.is_dir() {
            continue;
        }
        let Some(name) = file.enclosed_name() else {
            continue;
        };
        let name = name.to_string_lossy().replace('\\', "/");
        let mut buffer = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut buffer)
            .map_err(|err| AppError::io(format!("could not extract {name}: {err}")))?;
        entries.push((name, buffer));
    }
    Ok(entries)
}

/// Write `bytes` to `target`, creating parent directories. Plain (non-atomic)
/// writes are fine: the whole staging directory is renamed atomically once the
/// import is validated, so per-file durability would only add fsync cost.
fn write_file(target: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(dir) = target.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(target, bytes)?;
    Ok(())
}

/// A single top-level directory shared by every entry, when it isn't itself a
/// graph directory — i.e. a wrapper folder a zip commonly nests the graph under
/// (`my-graph/daily/...`). Returns `None` when entries live at the top level
/// (`daily/...`, `notes/...`) or span multiple top-level directories.
fn wrapper_prefix(entries: &[(String, Vec<u8>)]) -> Option<String> {
    let mut shared: Option<&str> = None;
    for (path, _) in entries {
        let first = path.split('/').find(|part| !part.is_empty() && *part != ".")?;
        match shared {
            None => shared = Some(first),
            Some(existing) if existing == first => {}
            Some(_) => return None, // more than one top-level entry
        }
    }
    let shared = shared?;
    if matches!(shared, "daily" | "notes" | "assets" | ".reflect") {
        return None;
    }
    Some(shared.to_string())
}

/// Turn an archive-relative path into a safe path under the graph root, or
/// `None` to skip it. Strips `prefix` (the wrapper dir), rejects traversal, and
/// drops the rebuildable index (`.reflect/`), VCS metadata (`.git/`), and OS
/// junk so they never enter a fresh graph.
fn sanitized_relative(raw: &str, prefix: Option<&str>) -> Option<PathBuf> {
    if raw.starts_with('/') {
        return None; // absolute — never trust it
    }
    let normalized = raw.replace('\\', "/");
    let mut parts: Vec<&str> = normalized
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect();
    if parts.contains(&"..") {
        return None;
    }
    if let Some(prefix) = prefix {
        if parts.first() == Some(&prefix) {
            parts.remove(0);
        }
    }
    let (&first, &last) = parts.first().zip(parts.last())?;
    if matches!(first, ".reflect" | ".git") || is_junk(last) {
        return None;
    }
    Some(parts.iter().collect())
}

/// OS/editor noise that should never be copied into a graph.
fn is_junk(name: &str) -> bool {
    name == ".DS_Store" || name == "Thumbs.db" || name.ends_with(".swp")
}

/// Whether `root` holds at least one markdown note under `daily/` or `notes/` —
/// the signal that a dropped archive is actually a Reflect graph.
fn has_note_markdown(root: &Path) -> bool {
    let mut found = Vec::new();
    for dir in ["daily", "notes"] {
        if collect_files(root, dir, Some("md"), &mut found).is_ok() && !found.is_empty() {
            return true;
        }
    }
    false
}

/// `<parent>/<name>`, suffixed with ` 2`, ` 3`, … until it's free, so importing
/// the same export twice never clobbers the first.
fn unique_destination(parent: &Path, name: &str) -> PathBuf {
    let base = sanitize_name(name);
    let mut candidate = parent.join(&base);
    let mut attempt = 2;
    while candidate.exists() {
        candidate = parent.join(format!("{base} {attempt}"));
        attempt += 1;
    }
    candidate
}

/// A filesystem-safe folder name from the archive name: drop any path
/// components, a trailing `.zip`, and path separators.
fn sanitize_name(name: &str) -> String {
    let stem = Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(name)
        .trim();
    let stem = stem
        .strip_suffix(".zip")
        .or_else(|| stem.strip_suffix(".ZIP"))
        .unwrap_or(stem);
    let cleaned: String = stem
        .chars()
        .filter(|character| !matches!(character, '/' | '\\' | ':'))
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        FALLBACK_NAME.to_string()
    } else {
        cleaned.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;

    fn files(pairs: &[(&str, &str)]) -> Vec<(String, Vec<u8>)> {
        pairs
            .iter()
            .map(|(path, body)| (path.to_string(), body.as_bytes().to_vec()))
            .collect()
    }

    #[test]
    fn imports_a_valid_export_and_fills_the_layout() {
        let parent = tempdir().unwrap();
        let root = import_into(
            parent.path(),
            "My Graph",
            files(&[("notes/Welcome.md", "# Welcome"), ("daily/2026-06-24.md", "today")]),
        )
        .unwrap();

        assert_eq!(root, parent.path().join("My Graph"));
        assert_eq!(
            std::fs::read_to_string(root.join("notes/Welcome.md")).unwrap(),
            "# Welcome"
        );
        // bootstrap filled in the rest of the standard layout.
        assert!(root.join("assets").is_dir());
        assert!(root.join(".reflect/meta.json").is_file());
    }

    #[test]
    fn strips_a_single_wrapper_directory() {
        let parent = tempdir().unwrap();
        let root = import_into(
            parent.path(),
            "graph",
            files(&[("graph/notes/a.md", "a"), ("graph/daily/b.md", "b")]),
        )
        .unwrap();
        assert!(root.join("notes/a.md").is_file());
        assert!(!root.join("graph").exists());
    }

    #[test]
    fn skips_index_vcs_and_junk() {
        let parent = tempdir().unwrap();
        let root = import_into(
            parent.path(),
            "g",
            files(&[
                ("notes/a.md", "a"),
                (".reflect/index.sqlite", "stale"),
                (".git/config", "[core]"),
                ("notes/.DS_Store", "junk"),
            ]),
        )
        .unwrap();
        assert!(root.join("notes/a.md").is_file());
        assert!(!root.join(".reflect/index.sqlite").exists());
        assert!(!root.join(".git").exists());
        assert!(!root.join("notes/.DS_Store").exists());
    }

    #[test]
    fn rejects_a_drop_without_notes_and_writes_nothing() {
        let parent = tempdir().unwrap();
        let result = import_into(parent.path(), "g", files(&[("README.txt", "hello")]));
        assert!(result.is_err());
        // Nothing committed — only the (now-removed) staging dir ever existed.
        assert!(std::fs::read_dir(parent.path()).unwrap().next().is_none());
    }

    #[test]
    fn disambiguates_an_occupied_destination() {
        let parent = tempdir().unwrap();
        let first = import_into(parent.path(), "Graph", files(&[("notes/a.md", "a")])).unwrap();
        let second = import_into(parent.path(), "Graph", files(&[("notes/b.md", "b")])).unwrap();
        assert_eq!(first, parent.path().join("Graph"));
        assert_eq!(second, parent.path().join("Graph 2"));
    }

    #[test]
    fn reads_and_imports_a_zip() {
        let mut buffer = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor::new(&mut buffer));
            let options = SimpleFileOptions::default();
            writer.start_file("export/notes/Hello.md", options).unwrap();
            writer.write_all(b"# Hello").unwrap();
            writer.start_file("export/assets/pic.bin", options).unwrap();
            writer.write_all(&[0, 1, 2, 3]).unwrap();
            writer.finish().unwrap();
        }

        let entries = read_zip_entries(&buffer).unwrap();
        let parent = tempdir().unwrap();
        let root = import_into(parent.path(), "export.zip", entries).unwrap();

        assert_eq!(root, parent.path().join("export"));
        assert_eq!(
            std::fs::read_to_string(root.join("notes/Hello.md")).unwrap(),
            "# Hello"
        );
        assert_eq!(std::fs::read(root.join("assets/pic.bin")).unwrap(), [0, 1, 2, 3]);
    }

    #[test]
    fn sanitize_name_drops_zip_suffix_and_separators() {
        assert_eq!(sanitize_name("My Graph.zip"), "My Graph");
        // `file_name()` drops directory components first, then separators are
        // stripped as a defense against a name that isn't a real path.
        assert_eq!(sanitize_name("a/b/c"), "c");
        assert_eq!(sanitize_name("weird:name"), "weirdname");
        assert_eq!(sanitize_name("   "), FALLBACK_NAME);
    }

    #[test]
    fn wrapper_prefix_ignores_real_graph_dirs() {
        assert_eq!(wrapper_prefix(&files(&[("wrap/notes/a.md", "a")])), Some("wrap".into()));
        assert_eq!(wrapper_prefix(&files(&[("notes/a.md", "a"), ("daily/b.md", "b")])), None);
        assert_eq!(wrapper_prefix(&files(&[("notes/a.md", "a")])), None);
    }
}

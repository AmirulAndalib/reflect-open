//! Disk primitives: graph bootstrap, atomic writes, and markdown listing.
//!
//! Pure IO — no Tauri state, no path policy (that's [`super::resolve`]). Writes
//! are atomic (temp file in the target dir + rename) so a crash mid-write can
//! never truncate a note.

use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::UNIX_EPOCH;

use crate::error::{AppError, AppResult};

use super::FileMeta;

pub(super) const REFLECT_DIR: &str = ".reflect";
const META_SCHEMA_VERSION: u32 = 1;
pub(super) const TOP_LEVEL_DIRS: [&str; 4] = ["daily", "notes", "assets", REFLECT_DIR];
/// Directories scanned by `list_files` for markdown notes.
pub(super) const NOTE_DIRS: [&str; 2] = ["daily", "notes"];

/// Create the standard graph layout + ignore/meta files (idempotent).
pub(super) fn bootstrap(root: &Path) -> AppResult<()> {
    for dir in TOP_LEVEL_DIRS {
        fs::create_dir_all(root.join(dir))?;
    }
    let gitignore = root.join(".gitignore");
    if !gitignore.exists() {
        fs::write(
            &gitignore,
            "# Reflect local index + caches (rebuildable; never committed)\n/.reflect/\n",
        )?;
    }
    let meta = root.join(REFLECT_DIR).join("meta.json");
    if !meta.exists() {
        fs::write(
            &meta,
            format!("{{\n  \"schemaVersion\": {META_SCHEMA_VERSION}\n}}\n"),
        )?;
    }
    Ok(())
}

/// Atomically write `contents` to `target` (temp file in the same dir + rename).
pub(super) fn atomic_write(target: &Path, contents: &str) -> AppResult<()> {
    atomic_write_bytes(target, contents.as_bytes())
}

/// Byte-level atomic write — shared by notes (text) and assets (binary).
pub(super) fn atomic_write_bytes(target: &Path, contents: &[u8]) -> AppResult<()> {
    let dir = target
        .parent()
        .ok_or_else(|| AppError::io(format!("no parent directory for {}", target.display())))?;
    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    tmp.write_all(contents)?;
    tmp.as_file().sync_all()?;
    tmp.persist(target)
        .map_err(|err| AppError::io(err.to_string()))?;
    Ok(())
}

/// Last-modified time in epoch milliseconds, or `None` when the platform
/// can't provide one. Shared by `list_files` and the watcher so every index
/// path derives mtimes the same way.
pub(crate) fn modified_ms(meta: &fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|dur| dur.as_millis() as u64)
}

/// Collect markdown files under `root/dir` into `out` (recursive).
pub(super) fn collect_markdown(root: &Path, dir: &str, out: &mut Vec<FileMeta>) -> AppResult<()> {
    let base = root.join(dir);
    if !base.is_dir() {
        return Ok(());
    }
    let mut stack = vec![base];
    while let Some(current) = stack.pop() {
        for entry in fs::read_dir(&current)? {
            let entry = entry?;
            // Don't follow symlinks — they can point outside the graph.
            let file_type = entry.file_type()?;
            if file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            if file_type.is_dir() {
                stack.push(path);
                continue;
            }
            if file_type.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                // Skip anything that isn't actually under the root rather than
                // leaking an absolute path.
                let Ok(rel) = path.strip_prefix(root) else {
                    continue;
                };
                let meta = entry.metadata()?;
                out.push(FileMeta {
                    path: rel.to_string_lossy().replace('\\', "/"),
                    size: meta.len(),
                    modified_ms: modified_ms(&meta).unwrap_or(0),
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn bootstrap_creates_layout() {
        let dir = tempdir().unwrap();
        bootstrap(dir.path()).unwrap();
        for sub in TOP_LEVEL_DIRS {
            assert!(dir.path().join(sub).is_dir(), "missing dir {sub}");
        }
        assert!(dir.path().join(".gitignore").exists());
        assert!(dir.path().join(".reflect/meta.json").exists());
    }

    #[test]
    fn atomic_write_round_trips() {
        let dir = tempdir().unwrap();
        bootstrap(dir.path()).unwrap();
        let target = dir.path().join("notes/hello.md");
        atomic_write(&target, "# Hello\n\nworld\n").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "# Hello\n\nworld\n");
    }

    #[test]
    fn list_finds_only_markdown_under_note_dirs() {
        let dir = tempdir().unwrap();
        bootstrap(dir.path()).unwrap();
        atomic_write(&dir.path().join("notes/a.md"), "a").unwrap();
        atomic_write(&dir.path().join("daily/2026-06-09.md"), "b").unwrap();
        atomic_write(&dir.path().join("notes/skip.txt"), "c").unwrap();

        let mut out = Vec::new();
        for d in NOTE_DIRS {
            collect_markdown(dir.path(), d, &mut out).unwrap();
        }
        let paths: Vec<&str> = out.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.contains(&"notes/a.md"));
        assert!(paths.contains(&"daily/2026-06-09.md"));
        assert!(!paths.iter().any(|p| p.ends_with(".txt")));
    }
}

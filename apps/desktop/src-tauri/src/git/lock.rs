//! Stale `.git/index.lock` recovery.
//!
//! libgit2 stages a commit by writing the new index into `.git/index.lock` and
//! atomically renaming it over `.git/index`. A process killed mid-commit — a
//! `tauri dev` reload, an OS kill, a hard crash — leaves that lock behind, and
//! every later commit or merge then fails with libgit2's `Locked` error ("the
//! index is locked; this might be due to a concurrent or crashed process").
//! Backup stays silently broken until the file is deleted by hand.
//!
//! Reflect serializes its own git operations and only one app instance writes a
//! given graph, so a lock that has sat untouched far longer than any commit
//! takes can only be such a leftover. We remove it before a write and let
//! libgit2 reacquire it cleanly. A *fresh* lock is never touched: deleting one a
//! live writer just created would corrupt that write, so the age gate always
//! errs toward leaving it — a still-live lock simply fails this cycle and is
//! reconsidered, now older, on the next.

use std::path::Path;
use std::time::{Duration, SystemTime};

use crate::error::AppResult;

/// A healthy commit holds `.git/index.lock` for milliseconds; a lock older than
/// this is a leftover, not an in-flight write. Deliberately generous — waiting
/// one extra sync cycle to clear a truly stale lock costs nothing next to the
/// risk of deleting a live one.
const STALE_LOCK_AGE: Duration = Duration::from_secs(60);

/// Remove `<git_dir>/index.lock` if it is present and provably stale (its mtime
/// is at least [`STALE_LOCK_AGE`] in the past). Returns whether a lock was
/// removed. `git_dir` is the repository's git directory (`repo.path()`), so this
/// is correct whatever the `.git` layout.
///
/// Best-effort by design: a missing lock, a fresh lock, an unreadable mtime, or
/// a lock another recovery removed first all return `Ok(false)` without error.
/// Recovery must never turn a transient filesystem hiccup into a backup failure;
/// only an unexpected delete error propagates.
pub(super) fn clear_stale_index_lock(git_dir: &Path) -> AppResult<bool> {
    let lock_path = git_dir.join("index.lock");
    let Ok(metadata) = std::fs::metadata(&lock_path) else {
        return Ok(false); // no lock (or unreadable) — nothing to recover
    };
    let Ok(modified) = metadata.modified() else {
        return Ok(false); // platform without mtime — refuse to guess
    };
    if !is_stale(modified, SystemTime::now()) {
        return Ok(false);
    }
    match std::fs::remove_file(&lock_path) {
        Ok(()) => {
            tracing::warn!(
                ?lock_path,
                "cleared a stale git index lock left by an interrupted backup"
            );
            Ok(true)
        }
        // The owner (or a concurrent recovery) winning the delete race lands on
        // the same end state we wanted: the lock is gone.
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(err.into()),
    }
}

/// Whether a lock last modified at `modified` is old enough to be a leftover. A
/// future mtime (clock skew, an odd filesystem clock) reads as fresh — we only
/// ever remove a lock we can prove is old.
fn is_stale(modified: SystemTime, now: SystemTime) -> bool {
    now.duration_since(modified)
        .map(|age| age >= STALE_LOCK_AGE)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{Duration, SystemTime};

    use tempfile::tempdir;

    use super::{clear_stale_index_lock, is_stale, STALE_LOCK_AGE};

    /// Write a `<dir>/index.lock` whose mtime is `age` in the past. The file
    /// handle is dropped before we return, so the recovery under test can remove
    /// it on every platform.
    fn write_lock_with_age(git_dir: &std::path::Path, age: Duration) {
        let lock_path = git_dir.join("index.lock");
        fs::write(&lock_path, b"").unwrap();
        let file = fs::File::options().write(true).open(&lock_path).unwrap();
        file.set_modified(SystemTime::now() - age).unwrap();
    }

    #[test]
    fn removes_a_stale_lock() {
        let dir = tempdir().unwrap();
        write_lock_with_age(dir.path(), STALE_LOCK_AGE + Duration::from_secs(5));

        assert!(clear_stale_index_lock(dir.path()).unwrap());
        assert!(!dir.path().join("index.lock").exists());
    }

    #[test]
    fn leaves_a_fresh_lock() {
        let dir = tempdir().unwrap();
        write_lock_with_age(dir.path(), Duration::from_secs(1));

        assert!(!clear_stale_index_lock(dir.path()).unwrap());
        assert!(dir.path().join("index.lock").exists());
    }

    #[test]
    fn no_lock_is_a_noop() {
        let dir = tempdir().unwrap();
        assert!(!clear_stale_index_lock(dir.path()).unwrap());
    }

    #[test]
    fn future_mtime_reads_as_fresh() {
        let now = SystemTime::now();
        assert!(!is_stale(now + Duration::from_secs(120), now));
    }
}

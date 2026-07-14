//! Shared `.gitignore` defaults for graph roots.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

const DEFAULT_GROUPS: &[(&str, &[&str])] = &[
    (
        "Reflect local index + caches (rebuildable; never committed)",
        &["/.reflect/"],
    ),
    ("macOS Finder metadata", &[".DS_Store", "._*"]),
    (
        "Windows Explorer metadata",
        &["Thumbs.db", "ehthumbs.db", "Desktop.ini"],
    ),
    ("Editor swap and backup files", &["*.swp", "*.swo", "*~"]),
];

/// The default `.gitignore` written for newly bootstrapped graphs.
pub(crate) fn default_contents() -> String {
    let mut contents = String::new();
    for &(heading, patterns) in DEFAULT_GROUPS {
        if !contents.is_empty() {
            contents.push('\n');
        }
        contents.push_str("# ");
        contents.push_str(heading);
        contents.push('\n');
        for pattern in patterns {
            contents.push_str(pattern);
            contents.push('\n');
        }
    }
    contents
}

/// Ensure graph repositories ignore only local machine/cache noise.
pub(crate) fn ensure_defaults(root: &Path) -> AppResult<()> {
    let path = root.join(".gitignore");
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let mut missing_groups: Vec<(&str, Vec<&str>)> = Vec::new();

    for &(heading, patterns) in DEFAULT_GROUPS {
        let missing_patterns = patterns
            .iter()
            .copied()
            .filter(|pattern| !has_pattern(&existing, pattern))
            .collect::<Vec<_>>();
        if !missing_patterns.is_empty() {
            missing_groups.push((heading, missing_patterns));
        }
    }

    if missing_groups.is_empty() {
        return Ok(());
    }

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    let mut prefix = if existing.is_empty() {
        ""
    } else if existing.ends_with('\n') {
        "\n"
    } else {
        "\n\n"
    };

    for (heading, patterns) in missing_groups {
        writeln!(file, "{prefix}# {heading}")?;
        for pattern in patterns {
            writeln!(file, "{pattern}")?;
        }
        prefix = "\n";
    }

    Ok(())
}

/// Keep runtime state out of an already-existing repository without touching
/// the vault's tracked `.gitignore`.
///
/// Explicit backup setup still calls [`ensure_defaults`]; opening somebody's
/// Markdown folder only changes Git's repository-local exclude file.
pub(crate) fn ensure_runtime_excluded(root: &Path) -> AppResult<()> {
    let Some(root_git_entry) = validate_root_git_entry(root)? else {
        return Ok(());
    };
    let repository = git2::Repository::open(root)?;
    require_matching_workdir(root, &repository)?;

    let git_dir = match root_git_entry {
        RootGitEntry::Directory => {
            if repository.is_worktree() {
                return Err(unsafe_git_path(
                    "Git directory for a normal repository",
                    repository.path(),
                ));
            }
            normalized(repository.path())
        }
        RootGitEntry::WorktreeFile { git_dir } => {
            if !repository.is_worktree() {
                return Err(AppError::io(
                    "A .git file is accepted only for a registered linked worktree",
                ));
            }
            require_same_path(&git_dir, repository.path(), "indirected Git directory")?;
            git_dir
        }
    };
    require_directory(&git_dir, "Git directory")?;
    let common_dir = if repository.is_worktree() {
        let gitdir_file = git_dir.join("gitdir");
        require_regular_file(&gitdir_file, "linked-worktree gitdir file")?;
        let registered_entry = resolve_path_file(&gitdir_file, &git_dir, None)?;
        require_same_path(
            &root.join(".git"),
            &registered_entry,
            "linked-worktree backpointer",
        )?;
        let commondir_file = git_dir.join("commondir");
        require_regular_file(&commondir_file, "linked-worktree commondir file")?;
        let common_dir = resolve_path_file(&commondir_file, &git_dir, None)?;
        require_directory(&common_dir, "Git common directory")?;
        require_worktree_admin_dir(&common_dir, &git_dir)?;
        require_same_path(
            &common_dir,
            repository.commondir(),
            "linked-worktree common directory",
        )?;
        common_dir
    } else {
        normalized(repository.commondir())
    };

    require_directory(&common_dir, "Git common directory")?;
    let info_dir = common_dir.join("info");
    match fs::symlink_metadata(&info_dir) {
        Ok(_) => require_directory(&info_dir, "Git info directory")?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&info_dir)?;
        }
        Err(error) => return Err(error.into()),
    }

    let path = info_dir.join("exclude");
    let (existing, exclude_exists) = match fs::symlink_metadata(&path) {
        Ok(_) => {
            require_regular_file(&path, "Git exclude file")?;
            (fs::read_to_string(&path)?, true)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (String::new(), false),
        Err(error) => return Err(error.into()),
    };
    const PATTERN: &str = "/.reflect/";
    if has_pattern(&existing, PATTERN) {
        return Ok(());
    }

    // Re-check the mutable parents immediately before opening the append target.
    // This cannot make a multi-step filesystem operation atomic, but it refuses
    // static symlink/non-directory layouts instead of following them.
    require_directory(&common_dir, "Git common directory")?;
    require_directory(&info_dir, "Git info directory")?;
    match fs::symlink_metadata(&path) {
        Ok(_) => require_regular_file(&path, "Git exclude file")?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    let mut options = fs::OpenOptions::new();
    options.append(true);
    if exclude_exists {
        options.create(false);
    } else {
        options.create_new(true);
    }
    let mut file = options.open(&path)?;
    // Opening is not the mutation. Revalidate every mutable component and
    // append through this already-open handle only after the path is still
    // the real in-repository file we inspected.
    require_directory(&common_dir, "Git common directory")?;
    require_directory(&info_dir, "Git info directory")?;
    require_regular_file(&path, "Git exclude file")?;
    if !existing.is_empty() && !existing.ends_with('\n') {
        writeln!(file)?;
    }
    writeln!(file, "{PATTERN}")?;
    Ok(())
}

enum RootGitEntry {
    Directory,
    WorktreeFile { git_dir: PathBuf },
}

fn validate_root_git_entry(root: &Path) -> AppResult<Option<RootGitEntry>> {
    let path = root.join(".git");
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if metadata.file_type().is_symlink() {
        return Err(unsafe_git_path("Git entry", &path));
    }
    if metadata.is_dir() {
        return Ok(Some(RootGitEntry::Directory));
    }
    if !metadata.is_file() {
        return Err(unsafe_git_path("Git entry", &path));
    }

    let git_dir = resolve_path_file(&path, root, Some("gitdir:"))?;
    require_directory(&git_dir, "indirected Git directory")?;
    Ok(Some(RootGitEntry::WorktreeFile { git_dir }))
}

fn require_matching_workdir(root: &Path, repository: &git2::Repository) -> AppResult<()> {
    let workdir = repository.workdir().ok_or_else(|| {
        AppError::io("The selected folder's Git repository has no working directory")
    })?;
    require_same_path(root, workdir, "Git working directory")
}

fn require_same_path(expected: &Path, actual: &Path, label: &str) -> AppResult<()> {
    if fs::canonicalize(expected)? != fs::canonicalize(actual)? {
        return Err(AppError::io(format!(
            "{label} does not belong to the selected folder"
        )));
    }
    Ok(())
}

fn require_worktree_admin_dir(common_dir: &Path, git_dir: &Path) -> AppResult<()> {
    let worktrees = common_dir.join("worktrees");
    let relative = git_dir
        .strip_prefix(&worktrees)
        .map_err(|_| unsafe_git_path("linked-worktree Git directory", git_dir))?;
    let mut components = relative.components();
    if !matches!(components.next(), Some(std::path::Component::Normal(_)))
        || components.next().is_some()
    {
        return Err(unsafe_git_path("linked-worktree Git directory", git_dir));
    }
    Ok(())
}

fn resolve_path_file(path: &Path, base: &Path, prefix: Option<&str>) -> AppResult<PathBuf> {
    let contents = fs::read_to_string(path)?;
    let mut lines = contents.lines();
    let value = match prefix {
        Some(prefix) => lines
            .next()
            .and_then(|line| line.strip_prefix(prefix))
            .map(str::trim),
        None => lines.next().map(str::trim),
    }
    .filter(|value| !value.is_empty())
    .ok_or_else(|| AppError::io(format!("Invalid Git path file: {}", path.display())))?;
    if lines.any(|line| !line.trim().is_empty()) {
        return Err(AppError::io(format!(
            "Invalid Git path file: {}",
            path.display()
        )));
    }
    let referenced = Path::new(value);
    let resolved = if referenced.is_absolute() {
        referenced.to_path_buf()
    } else {
        base.join(referenced)
    };
    Ok(normalized(&resolved))
}

fn require_directory(path: &Path, label: &str) -> AppResult<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(unsafe_git_path(label, path));
    }
    Ok(())
}

fn require_regular_file(path: &Path, label: &str) -> AppResult<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(unsafe_git_path(label, path));
    }
    Ok(())
}

fn unsafe_git_path(label: &str, path: &Path) -> AppError {
    AppError::io(format!(
        "{label} must not be a symlink and must have the expected type: {}",
        path.display()
    ))
}

fn normalized(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if !result.pop() {
                    result.push(component);
                }
            }
            _ => result.push(component),
        }
    }
    result
}

fn has_pattern(existing: &str, pattern: &str) -> bool {
    existing
        .lines()
        .map(str::trim)
        .any(|line| line == pattern || is_reflect_equivalent(line, pattern))
}

fn is_reflect_equivalent(line: &str, pattern: &str) -> bool {
    pattern == "/.reflect/" && matches!(line, "/.reflect" | ".reflect/" | ".reflect")
}

#[cfg(test)]
mod tests {
    use super::ensure_runtime_excluded;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn commit_initial(repository: &git2::Repository) {
        let mut index = repository.index().expect("open index");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repository.find_tree(tree_id).expect("find tree");
        let signature =
            git2::Signature::now("Reflect test", "test@reflect.app").expect("create signature");
        repository
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                "Initial commit",
                &tree,
                &[],
            )
            .expect("create initial commit");
    }

    fn create_linked_worktree() -> (tempfile::TempDir, tempfile::TempDir, PathBuf, PathBuf) {
        let common_root = tempfile::tempdir().expect("common tempdir");
        let repository = git2::Repository::init(common_root.path()).expect("git init");
        commit_initial(&repository);

        let linked_parent = tempfile::tempdir().expect("linked parent");
        let linked_root = linked_parent.path().join("linked");
        let worktree = repository
            .worktree("linked", &linked_root, None)
            .expect("create linked worktree");
        let linked_repository =
            git2::Repository::open_from_worktree(&worktree).expect("open linked repository");
        let linked_git_dir = linked_repository.path().components().collect();
        drop(linked_repository);
        drop(worktree);
        drop(repository);

        (common_root, linked_parent, linked_root, linked_git_dir)
    }

    fn exclude_contents(git_dir: &Path) -> String {
        fs::read_to_string(git_dir.join("info/exclude")).expect("read exclude")
    }

    #[test]
    fn runtime_exclude_is_local_and_idempotent() {
        let root = tempfile::tempdir().expect("tempdir");
        let repository = git2::Repository::init(root.path()).expect("git init");
        let exclude = repository.path().join("info/exclude");
        std::fs::write(&exclude, "*.bak\n").expect("seed exclude");

        ensure_runtime_excluded(root.path()).expect("exclude runtime");
        ensure_runtime_excluded(root.path()).expect("exclude runtime twice");

        let contents = std::fs::read_to_string(exclude).expect("read exclude");
        assert!(contents.contains("*.bak\n"));
        assert_eq!(contents.matches("/.reflect/").count(), 1);
        assert!(!root.path().join(".gitignore").exists());
    }

    #[test]
    fn non_repository_is_untouched() {
        let root = tempfile::tempdir().expect("tempdir");
        ensure_runtime_excluded(root.path()).expect("no-op");
        assert!(!root.path().join(".gitignore").exists());
        assert!(!root.path().join(".git").exists());
    }

    #[test]
    fn linked_worktree_uses_the_common_repository_exclude() {
        let (common_root, _linked_parent, linked_root, _linked_git_dir) = create_linked_worktree();
        let common_repository =
            git2::Repository::open(common_root.path()).expect("open common repository");

        ensure_runtime_excluded(&linked_root).expect("exclude linked runtime");

        assert!(exclude_contents(common_repository.path()).contains("/.reflect/"));
        assert!(!linked_root.join(".gitignore").exists());
    }

    #[test]
    fn non_directory_info_path_is_rejected() {
        let root = tempfile::tempdir().expect("tempdir");
        let repository = git2::Repository::init(root.path()).expect("git init");
        let info = repository.path().join("info");
        fs::remove_dir_all(&info).expect("remove info directory");
        fs::write(&info, "not a directory").expect("replace info with file");

        assert!(ensure_runtime_excluded(root.path()).is_err());
        assert_eq!(
            fs::read_to_string(info).expect("read info file"),
            "not a directory"
        );
    }

    #[test]
    fn non_file_exclude_path_is_rejected() {
        let root = tempfile::tempdir().expect("tempdir");
        let repository = git2::Repository::init(root.path()).expect("git init");
        let exclude = repository.path().join("info/exclude");
        fs::remove_file(&exclude).expect("remove exclude file");
        fs::create_dir(&exclude).expect("replace exclude with directory");

        assert!(ensure_runtime_excluded(root.path()).is_err());
        assert!(exclude.is_dir());
    }

    #[test]
    fn git_file_cannot_redirect_to_an_unrelated_repository() {
        let target_root = tempfile::tempdir().expect("target tempdir");
        let target_repository =
            git2::Repository::init(target_root.path()).expect("target git init");
        let before = exclude_contents(target_repository.path());
        let graph_root = tempfile::tempdir().expect("graph tempdir");
        fs::write(
            graph_root.path().join(".git"),
            format!("gitdir: {}\n", target_repository.path().display()),
        )
        .expect("write crafted git file");

        assert!(ensure_runtime_excluded(graph_root.path()).is_err());
        assert_eq!(exclude_contents(target_repository.path()), before);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_root_git_entry_is_rejected_without_mutating_target() {
        use std::os::unix::fs::symlink;

        let target_root = tempfile::tempdir().expect("target tempdir");
        let target_repository =
            git2::Repository::init(target_root.path()).expect("target git init");
        let before = exclude_contents(target_repository.path());
        let graph_root = tempfile::tempdir().expect("graph tempdir");
        symlink(target_repository.path(), graph_root.path().join(".git"))
            .expect("symlink git entry");

        assert!(ensure_runtime_excluded(graph_root.path()).is_err());
        assert_eq!(exclude_contents(target_repository.path()), before);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_info_directory_is_rejected_without_mutating_target() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().expect("tempdir");
        let repository = git2::Repository::init(root.path()).expect("git init");
        let info = repository.path().join("info");
        fs::remove_dir_all(&info).expect("remove info directory");
        let target = tempfile::tempdir().expect("target tempdir");
        symlink(target.path(), &info).expect("symlink info directory");

        assert!(ensure_runtime_excluded(root.path()).is_err());
        assert!(!target.path().join("exclude").exists());
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_exclude_file_is_rejected_without_mutating_target() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().expect("tempdir");
        let repository = git2::Repository::init(root.path()).expect("git init");
        let exclude = repository.path().join("info/exclude");
        fs::remove_file(&exclude).expect("remove exclude file");
        let target = root.path().join("outside-exclude");
        fs::write(&target, "keep me\n").expect("write target");
        symlink(&target, &exclude).expect("symlink exclude file");

        assert!(ensure_runtime_excluded(root.path()).is_err());
        assert_eq!(
            fs::read_to_string(target).expect("read target"),
            "keep me\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_linked_worktree_git_directory_is_not_followed() {
        use std::os::unix::fs::symlink;

        let (common_root, _linked_parent, linked_root, linked_git_dir) = create_linked_worktree();
        let common_repository =
            git2::Repository::open(common_root.path()).expect("open common repository");
        let before = exclude_contents(common_repository.path());
        drop(common_repository);

        let real_git_dir = linked_git_dir.with_file_name("linked-real");
        fs::rename(&linked_git_dir, &real_git_dir).expect("move linked git directory");
        symlink(&real_git_dir, &linked_git_dir).expect("symlink linked git directory");

        assert!(ensure_runtime_excluded(&linked_root).is_err());
        let common_repository =
            git2::Repository::open(common_root.path()).expect("reopen common repository");
        assert_eq!(exclude_contents(common_repository.path()), before);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_linked_worktree_gitdir_file_is_rejected() {
        use std::os::unix::fs::symlink;

        let (common_root, _linked_parent, linked_root, linked_git_dir) = create_linked_worktree();
        let common_repository =
            git2::Repository::open(common_root.path()).expect("open common repository");
        let before = exclude_contents(common_repository.path());
        drop(common_repository);

        let gitdir = linked_git_dir.join("gitdir");
        let real_gitdir = linked_git_dir.join("gitdir-real");
        fs::rename(&gitdir, &real_gitdir).expect("move gitdir file");
        symlink(&real_gitdir, &gitdir).expect("symlink gitdir file");

        assert!(ensure_runtime_excluded(&linked_root).is_err());
        let common_repository =
            git2::Repository::open(common_root.path()).expect("reopen common repository");
        assert_eq!(exclude_contents(common_repository.path()), before);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_linked_worktree_commondir_file_is_rejected() {
        use std::os::unix::fs::symlink;

        let (common_root, _linked_parent, linked_root, linked_git_dir) = create_linked_worktree();
        let common_repository =
            git2::Repository::open(common_root.path()).expect("open common repository");
        let before = exclude_contents(common_repository.path());
        drop(common_repository);

        let commondir = linked_git_dir.join("commondir");
        let real_commondir = linked_git_dir.join("commondir-real");
        fs::rename(&commondir, &real_commondir).expect("move commondir file");
        symlink(&real_commondir, &commondir).expect("symlink commondir file");

        assert!(ensure_runtime_excluded(&linked_root).is_err());
        let common_repository =
            git2::Repository::open(common_root.path()).expect("reopen common repository");
        assert_eq!(exclude_contents(common_repository.path()), before);
    }
}

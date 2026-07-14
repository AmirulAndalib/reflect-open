//! Shared graph-relative path policy for Reflect's native surfaces.
//!
//! Markdown can live anywhere in an opened vault. The durable boundary is
//! deliberately lexical: callers pass a graph-relative path, and this module
//! rejects hidden/traversal components before classifying it. Filesystem walks
//! must still skip symlinks separately because a lexical path cannot reveal
//! what an entry points at.

use std::path::{Component, Path};

/// Root trees reserved for Reflect-managed attachments and recordings.
/// Markdown under either tree is content, not a note.
pub const RESERVED_NOTE_TREES: [&str; 2] = ["assets", "audio-memos"];

/// Obsidian-compatible local attachment formats supported by Reflect.
pub const ATTACHMENT_EXTENSIONS: [&str; 20] = [
    "3gp", "avif", "bmp", "flac", "gif", "jpeg", "jpg", "m4a", "mkv", "mov", "mp3", "mp4", "ogg",
    "ogv", "pdf", "png", "svg", "wav", "webm", "webp",
];

/// The kind of graph content represented by a safe relative path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphPathKind {
    Note,
    Attachment,
}

/// Classify a normalized graph-relative path.
///
/// Notes require an exactly lowercase `.md` suffix. Attachments match their
/// extension case-insensitively. Absolute paths, traversal components, and any
/// dot-prefixed component are rejected.
pub fn classify(path: &Path) -> Option<GraphPathKind> {
    let components = visible_components(path)?;
    classify_components(&components)
}

/// Classify a forward-slashed path crossing an IPC or fixture boundary.
///
/// Unlike [`Path::components`], this deliberately rejects redundant separators
/// and `.` components instead of normalizing them. There is one canonical wire
/// representation, shared with TypeScript, on every platform.
pub fn classify_normalized(path: &str) -> Option<GraphPathKind> {
    if path.is_empty() || path.starts_with('/') || path.ends_with('/') || path.contains('\\') {
        return None;
    }
    let components: Vec<&str> = path.split('/').collect();
    if components
        .iter()
        .any(|component| component.is_empty() || component.starts_with('.'))
    {
        return None;
    }
    if components
        .first()
        .is_some_and(|first| first.len() == 2 && first.ends_with(':'))
    {
        return None;
    }
    classify_components(&components)
}

fn classify_components(components: &[&str]) -> Option<GraphPathKind> {
    let first = *components.first()?;
    let file_name = *components.last()?;
    let (_, extension) = file_name.rsplit_once('.')?;
    if extension == "md" && !RESERVED_NOTE_TREES.contains(&first) {
        return Some(GraphPathKind::Note);
    }
    ATTACHMENT_EXTENSIONS
        .iter()
        .any(|candidate| extension.eq_ignore_ascii_case(candidate))
        .then_some(GraphPathKind::Attachment)
}

/// Whether a path is an eligible Markdown note.
pub fn is_note(path: &Path) -> bool {
    classify(path) == Some(GraphPathKind::Note)
}

/// Whether a path is a supported local attachment.
pub fn is_attachment(path: &Path) -> bool {
    classify(path) == Some(GraphPathKind::Attachment)
}

/// Whether a graph-relative directory can contain eligible notes.
///
/// Walkers call this before descending, pruning hidden and reserved trees at
/// their root instead of traversing them and filtering every leaf.
pub fn may_contain_notes(path: &Path) -> bool {
    if !is_safe_visible_relative(path) {
        return false;
    }
    path.components()
        .next()
        .and_then(|component| component.as_os_str().to_str())
        .is_some_and(|first| !RESERVED_NOTE_TREES.contains(&first))
}

/// Whether every path component is a visible, normal relative component.
pub fn is_safe_visible_relative(path: &Path) -> bool {
    visible_components(path).is_some()
}

/// The logical file name represented by an iCloud eviction placeholder.
pub fn icloud_placeholder_target(file_name: &str) -> Option<&str> {
    let name = file_name.strip_prefix('.')?.strip_suffix(".icloud")?;
    (!name.is_empty()).then_some(name)
}

fn visible_components(path: &Path) -> Option<Vec<&str>> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return None;
    }
    let components: Vec<&str> = path
        .components()
        .map(|component| match component {
            Component::Normal(value) => value
                .to_str()
                .filter(|component| !component.starts_with('.') && !component.contains('\\')),
            _ => None,
        })
        .collect::<Option<_>>()?;
    if components
        .first()
        .is_some_and(|first| first.len() == 2 && first.ends_with(':'))
    {
        return None;
    }
    Some(components)
}

#[cfg(test)]
mod tests {
    use super::{classify_normalized, GraphPathKind};
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Fixture {
        path: String,
        kind: Option<String>,
    }

    #[test]
    fn shared_fixture_corpus_matches_rust_policy() {
        let raw = include_str!("../../../fixtures/graph-path-classification.json");
        let fixtures: Vec<Fixture> = serde_json::from_str(raw).expect("valid fixture corpus");
        for fixture in fixtures {
            let expected = match fixture.kind.as_deref() {
                Some("note") => Some(GraphPathKind::Note),
                Some("attachment") => Some(GraphPathKind::Attachment),
                None => None,
                Some(other) => panic!("unknown fixture kind {other}"),
            };
            assert_eq!(
                classify_normalized(&fixture.path),
                expected,
                "{}",
                fixture.path
            );
        }
    }
}

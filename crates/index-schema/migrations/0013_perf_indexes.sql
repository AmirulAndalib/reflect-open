-- Performance: partial indexes for the four most-common full-table-scan paths.

-- 1. listNotes / listRecentNotes: WHERE daily_date IS NULL ORDER BY mtime DESC, path
--    The existing notes_daily_date_mtime_path index leads on daily_date, so SQLite
--    cannot use it when the filter is `daily_date IS NULL` (an IS NULL predicate is
--    not an equality scan of the leading column). This partial index covers the
--    predicate exactly, eliminating the full-table-scan + filesort on every All Notes
--    load.
CREATE INDEX IF NOT EXISTS notes_non_daily_mtime ON notes(mtime DESC, path) WHERE daily_date IS NULL;

-- 2. getPinnedNotes / is:pinned filter: WHERE is_pinned = 1 ORDER BY pinned_order, ...
--    No index exists on is_pinned. A partial covering index over the pinned population
--    avoids a full-table scan to find the typically small number of pinned notes.
CREATE INDEX IF NOT EXISTS notes_pinned ON notes(is_pinned, pinned_order, title_key, path) WHERE is_pinned = 1;

-- 3. getCompletedTasks: WHERE tasks.checked = 1 (joined to notes for ordering)
--    Mirrors the existing tasks_open_by_note partial index for the completed partition.
--    Without this, finding completed tasks requires a full scan of the tasks table.
CREATE INDEX IF NOT EXISTS tasks_completed_by_note ON tasks(note_path) WHERE checked = 1;

-- 4. getConflictedNotes: WHERE has_conflict = 1 ORDER BY path
--    No index exists on has_conflict. A partial index on the (rare) conflicted
--    population avoids a full scan and covers the ORDER BY path without an extra sort.
CREATE INDEX IF NOT EXISTS notes_has_conflict ON notes(path) WHERE has_conflict = 1;

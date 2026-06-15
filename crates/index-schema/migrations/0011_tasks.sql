-- Plan 18: the Tasks view is a projection over GFM checkboxes. Each `- [ ] text`
-- / `- [x] text` item in a note becomes one row, keyed by the marker's character
-- offset in the file (UTF-16 code units, the unit Lezer reports — never UTF-8
-- bytes). A pure projection like links/tags: ON DELETE CASCADE so a removed
-- note's tasks vanish with it, and the write path moves these rows explicitly on
-- rename (no ON UPDATE CASCADE, matching the other child tables). Rebuildable —
-- it never holds anything durable, so no wipe of chat_* here.
CREATE TABLE tasks (
  note_path     TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
  marker_offset INTEGER NOT NULL,
  text          TEXT NOT NULL,
  raw           TEXT NOT NULL,
  checked       INTEGER NOT NULL,
  PRIMARY KEY (note_path, marker_offset)
);

-- The Tasks view scans every *open* checkbox across the graph and joins to notes
-- for title/daily-date context. A partial index over just the open rows, keyed
-- by note_path, serves that grouped, note-joined read directly.
CREATE INDEX tasks_open_by_note ON tasks(note_path) WHERE checked = 0;

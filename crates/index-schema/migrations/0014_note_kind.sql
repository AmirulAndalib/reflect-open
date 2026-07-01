-- Note kind: distinguishes templates (`templates/*.md`) from the notes that
-- make up the graph. Templates are indexed — openable and editable in-app —
-- but excluded from every note surface (All Notes, search, backlinks, tasks,
-- AI retrieval). Derived from the path at index time; rebuildable.

ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note'
  CHECK (kind IN ('daily', 'note', 'template'));

-- Wikilinks must never resolve to a template (a note linking [[Journal]] must
-- not target a template titled "Journal"), and links written inside a template
-- body are boilerplate, not graph edges. Excluding templates from `note_keys`
-- and template sources from `backlinks` enforces both at the schema level, so
-- no query-time filter can forget it.
DROP VIEW backlinks;
DROP VIEW note_keys;

CREATE VIEW note_keys AS
  SELECT path AS note_path, title_key AS key FROM notes WHERE kind != 'template'
  UNION
  SELECT note_path, alias_key AS key FROM aliases
    JOIN notes ON notes.path = aliases.note_path AND notes.kind != 'template'
  UNION
  SELECT path AS note_path, daily_date AS key FROM notes WHERE daily_date IS NOT NULL;

CREATE VIEW backlinks AS
  SELECT k.note_path AS target_path, l.source_path, l.kind, l.target_raw, l.alias, l.pos_from, l.pos_to
  FROM links l JOIN note_keys k ON k.key = l.target_key
  JOIN notes source ON source.path = l.source_path AND source.kind != 'template'
  WHERE l.kind = 'wiki';

-- The kind is extracted at index time and the open-time reconcile hash-skips
-- unchanged files, so pre-migration rows would keep the 'note' default forever
-- (moot today — nothing indexed `templates/` before this — but the wipe keeps
-- the 0004 invariant: a derived column is never left at its migration default).
-- `index_meta` is bookkeeping and the embedding tables are content-hash-keyed,
-- so they survive; `chat_*` is durable history and must never be touched.
DELETE FROM note_text;
DELETE FROM links;
DELETE FROM tags;
DELETE FROM aliases;
DELETE FROM assets;
DELETE FROM tasks;
DELETE FROM notes;
DELETE FROM search_fts;

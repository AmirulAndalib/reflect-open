-- Sync conflicts (Plan 12): a merge writes Git conflict markers into the note
-- and the indexer detects them from content, so "this note needs review" is a
-- projection of the file — it survives rebuilds and clears itself when the
-- user edits the markers away. No separate conflict bookkeeping to drift.

ALTER TABLE notes ADD COLUMN has_conflict INTEGER NOT NULL DEFAULT 0;

-- Same projection-wipe rationale as 0004: the flag is extracted at index time
-- and the open-time reconcile hash-skips unchanged files, so pre-migration
-- rows would keep has_conflict=0 even where the file already carries markers.
-- Drop the note rows so the next open re-indexes with the new column populated
-- (index_meta and the content-hash-keyed embedding tables survive).
DELETE FROM note_text;
DELETE FROM links;
DELETE FROM tags;
DELETE FROM aliases;
DELETE FROM assets;
DELETE FROM notes;
DELETE FROM search_fts;

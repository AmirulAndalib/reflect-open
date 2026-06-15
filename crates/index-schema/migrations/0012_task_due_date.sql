-- Plan 18 / V1 parity: a task can carry an explicit due date — the first
-- calendar-valid `[[YYYY-MM-DD]]` link inside the item (V1's "scheduling is
-- association"). It's distinct from the source note's daily date and drives the
-- Overdue bucket on its own (a bare task in a past daily note is Current, not
-- Overdue). Nullable; populated when the projection is reprojected (the matching
-- PROJECTION_VERSION bump forces that). Grouping is computed in TS, so no index.
ALTER TABLE tasks ADD COLUMN due_date TEXT;

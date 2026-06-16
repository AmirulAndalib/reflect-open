# Performance Pass — Benchmarks & Measurement Guide

## Why there are no automated benchmark numbers

The full Tauri desktop app requires a compiled Rust toolchain and native IPC bridge, which are not available in CI (no Rust toolchain on this machine — see project memory). All performance assertions below are therefore qualitative and reasoned from first principles, with instructions for measuring the real impact on a developer machine.

---

## 1. React render memoization

### What changed

| Component | Change | Why it helps |
|---|---|---|
| `AllNotesRow` | Wrapped in `React.memo` | Each keystroke in the search box re-renders the entire row list; memo short-circuits when `note`, `onSelect`, and `onToggle` are reference-stable |
| `all-notes-table.tsx` | Added `handleToggle = useCallback(...)` | Previous inline arrow function was a new reference every render, defeating memo on every row |
| `all-notes-screen.tsx` | Added `handleFilterSelect = useCallback(...)` | Same pattern — inline arrow in JSX created a new reference per render |
| `backlinks-panel.tsx` | `groupBacklinksBySource` wrapped in `useMemo`, `handleOpen` in `useCallback` | `groupBacklinksBySource` does O(N) work on every render even when `data` has not changed |

### How to measure

**React DevTools Profiler** (recommended):

1. Open Reflect in `pnpm dev` mode.
2. Open Chrome DevTools → React DevTools Profiler tab.
3. Enable "Record why each component rendered" in Profiler settings.
4. Click Record, type a character in the All Notes search box, stop recording.
5. Inspect the flame graph: each `AllNotesRow` should show "Did not render" when `note` is unchanged.

**Before baseline**: every keystroke re-renders all visible rows (look for "Parent changed" in Profiler for every `AllNotesRow` node even when the row data is unchanged).

**After**: only rows whose `note` prop actually changed should re-render. On a 500-note list this collapses ~500 renders per keystroke to ~0–5.

### Expected outcome

Reduced main-thread blocking per keystroke. Visible as lower "scripting" time in the Chrome Performance panel during a typing burst in the All Notes search box. Target: < 4 ms scripting per keystroke (from an estimated 15–40 ms without memo on large lists).

---

## 2. SQLite index coverage

### What changed

Migration `0013_perf_indexes.sql` adds four partial indexes:

| Index | Table | Query pattern it covers |
|---|---|---|
| `notes_non_daily_mtime` | `notes(mtime DESC, path) WHERE daily_date IS NULL` | `listNotes` / `listRecentNotes` ORDER BY mtime on non-daily notes — was a full-table-scan + filesort |
| `notes_pinned` | `notes(is_pinned, pinned_order, title_key, path) WHERE is_pinned = 1` | `getPinnedNotes` and `is:pinned` filter — covers a rare subset without touching the full table |
| `tasks_completed_by_note` | `tasks(note_path) WHERE checked = 1` | Mirrors existing `tasks_open_by_note` pattern; covers completed-task lookups by note path |
| `notes_has_conflict` | `notes(path) WHERE has_conflict = 1` | `getConflictedNotes` — was a full scan for a column that is almost always NULL |

### How to measure

Use SQLite's `EXPLAIN QUERY PLAN` against the index.sqlite file:

```bash
# Find the graph database (adjust path to your graph location)
sqlite3 ~/.reflect/<your-graph>/.reflect/index.sqlite

-- Before index (schema version 12):
EXPLAIN QUERY PLAN
  SELECT path, mtime FROM notes WHERE daily_date IS NULL ORDER BY mtime DESC LIMIT 50;
-- Expected (bad): "SCAN notes ORDER BY ..."

-- After index (schema version 13):
EXPLAIN QUERY PLAN
  SELECT path, mtime FROM notes WHERE daily_date IS NULL ORDER BY mtime DESC LIMIT 50;
-- Expected (good): "SEARCH notes USING INDEX notes_non_daily_mtime ..."
```

Run the same against the pinned and conflict queries:

```sql
EXPLAIN QUERY PLAN SELECT * FROM notes WHERE is_pinned = 1 ORDER BY pinned_order;
EXPLAIN QUERY PLAN SELECT path FROM notes WHERE has_conflict = 1;
EXPLAIN QUERY PLAN SELECT note_path FROM tasks WHERE checked = 1 AND note_path = ?;
```

### Expected outcome

All four queries switch from `SCAN` (full table) to `SEARCH ... USING INDEX`. On a graph with 1 000+ notes the `listNotes` query is expected to drop from O(N) to O(log N + k) where k is the page size. Real-world latency improvement depends on SQLite page-cache state but is typically 10–100× on cold cache.

### Safety note

All indexes are `CREATE INDEX IF NOT EXISTS` — they are no-ops if already applied. The migration is append-only and does not alter any existing table or index. The schema version bump (12 → 13) ensures the migration runs exactly once.

---

## 3. Startup deferral

### What changed

| File | Change |
|---|---|
| `platform-root.tsx` | `getAppPlatform()` IPC call hoisted to module scope (`platformPromise`) so it is in-flight before React mounts; the `useEffect` now `.then()`s on an already-in-flight promise |
| `graph-provider.tsx` | `setGraph` / `setIndexGeneration` / `setStatus('ready')` now called immediately after `index.open()` resolves; `ensureWelcomeNote` is fire-and-forget (no `await`) |

### How to measure

**Chrome Performance panel** (requires `pnpm tauri dev`):

1. Open Reflect. Open Chrome DevTools → Performance tab.
2. Click Record, then immediately restart the app (Cmd+R or via Tauri reload).
3. Stop recording after the workspace is visible.
4. Look for the "FCP" (First Contentful Paint) and "LCP" markers.
5. Identify the gap between app load and first workspace paint.

**Simpler proxy** — measure time-to-interactive in the browser console:

```js
// Paste into DevTools console right after the page loads
performance.getEntriesByType('navigation')[0].domInteractive
```

Compare this value before and after the changes. The platform-root change saves approximately one Tauri IPC round-trip (typically 1–5 ms on localhost). The graph-provider change saves 1–3 sequential IPC calls from the critical path on second and subsequent launches, which may save 5–30 ms of time-to-workspace.

### Expected outcome

On repeated opens (welcome note already seeded), the workspace becomes interactive 1–3 frames earlier. On first launch, behavior is identical — `ensureWelcomeNote` races with the index reconcile but is picked up by the next watcher event, which is consistent with the existing best-effort contract.

---

## Environment caveats

- All measurements should be taken on a machine with a compiled Rust toolchain running `pnpm tauri dev` (not `pnpm dev`), because the IPC bridge is only active in the Tauri context.
- SQLite EXPLAIN plans can be checked without a Rust build using any SQLite client pointed at the `.reflect/index.sqlite` file in an existing graph.
- React Profiler measurements work in both `pnpm dev` and `pnpm tauri dev`.
- Results vary by machine (CPU, SSD speed) and graph size (number of notes). A graph with < 100 notes will show minimal difference; a graph with 2 000+ notes will show the most benefit from the DB index changes.

---

## Commands for verification

```bash
# TypeScript typecheck
pnpm typecheck

# Lint (expect warnings only, no errors)
pnpm lint

# Tests for changed logic
pnpm test --run apps/desktop/src/components/all-notes/all-notes-screen.test.tsx
pnpm test --run apps/desktop/src/components/backlinks-panel.test.tsx
pnpm test --run apps/desktop/src/providers/graph-provider.test.tsx
```

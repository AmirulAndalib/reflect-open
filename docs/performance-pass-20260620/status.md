# Performance Pass — Status

## 2026-06-20

### Phase 1 — Grounding (done)
- Read SKILL.md, AGENTS.md, prior pass (`docs/performance-pass/`, PR #233).
- Read the hot-path code: daily-stream, note-pane, note-editor, use-note-document,
  document-binding, graph-provider, graph-index, query-client, live.ts (core),
  index-applied.ts, backlinks-panel, focused-daily-provider, sidebar-provider,
  use-palette-results, all-notes-query, use-similar-notes.
- Confirmed test toolchain: `pnpm vitest run <path>` from `apps/desktop`
  (the root `pnpm test` is a turbo wrapper that does not forward file args).
  Baseline: `backlinks-panel.test.tsx` → 9/9 pass.

### Observations
- The codebase is already carefully optimized: uncontrolled editor with
  ref-read callbacks, stable session epoch keying, split focused-daily contexts,
  memoized provider values, virtualized stream with ref-write scroll save,
  `useDeferredValue` in the palette, structural sharing on all index queries.
- Primary remaining churn target: `invalidateIndexQueries()` invalidates the
  whole `['index']` scope on every applied watcher batch, while
  `subscribeIndexChanges` already provides the changed paths. Every mounted
  index query (backlinks ×N visible days, note-conflict ×N, dailyDates,
  pinned-notes, related/similar-notes vector search, palette, etc.) refetches.

### Phase 2 — Parallel audit (running)
- Workflow `perf-audit-reflect` (5 area audits → adversarial verify per finding).
- Areas: daily-stream, editor, invalidation, lists-search, context-panes.

### Phase 2 — Parallel audit (done)
- Workflow returned 7 confirmed (adversarially verified) findings, 14 rejected.
- Rejected (correctly): invalidation debounce (watcher already debounces ~400ms),
  index-scope narrowing (would show stale backlinks/conflict/dup-id state),
  useCallback-only fixes on non-memoized rows.

### Phase 3 — Implementation (done)
Six behavior-preserving changes (all follow #233's memo pattern):
1. `note-pane.tsx` — `React.memo(NotePane)` (highest impact: skips 4 hooks ×
   visible day on every stream re-render).
2. `command-palette.tsx` — stable `key="note-preview"` (no remount per ↑/↓).
3. `command-palette.tsx` — `React.memo(Snippet)` (no `parseHighlights` rerun).
4. `sidebar-note-row.tsx` — `React.memo(SidebarNoteRow)`.
5. `day-calendar.tsx` — `useMemo` the lookup `Set`.
6. `use-similar-notes.ts` — `useMemo` the sliced result.

Added tests:
- `use-similar-notes.test.tsx` — reference-stable result across re-renders.
- `sidebar-note-row.test.tsx` — no re-render on identical-prop parent updates.

### Verification (done)
- `pnpm typecheck` → pass (all packages).
- `pnpm lint` → 0 errors, 5 pre-existing warnings (none in touched files).
- `pnpm --filter @reflect/desktop build` → success.
- `pnpm vitest run` (15 suites incl. 2 new) → 116/116 pass.
- `git diff --check origin/next...HEAD` → clean.

### Next
- Commit, push, open PR against `next`, write final-report.md.

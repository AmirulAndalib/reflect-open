# Performance Pass — 2026-06-20

**Branch:** `claude/performance-pass-20260620` (based on `origin/next` @ 7225f2e)
**Scope:** Reflect Open desktop app — high-frequency user paths.

## Context

A prior pass (PR #233, `docs/performance-pass/`) already landed:
row memoization for All Notes, backlinks-panel `useMemo`/`useCallback`,
four SQLite partial indexes (migration 0013), and startup IPC deferral.
**This pass must not duplicate that work.** It targets churn the prior pass
did not address.

## Hot paths in scope

1. Scrolling the daily stream (virtualized day list).
2. Opening / switching notes (editor mount/update, document binding).
3. Editor mount/update costs.
4. Note lists / search / backlinks / context panes.
5. Repeated data fetching / render churn / query invalidation.

## Early findings (grounding read)

- **Global query invalidation churn (primary target).**
  `graph-provider.tsx` wires `onApplied: invalidateIndexQueries`, which
  invalidates the *entire* `['index']` query scope on every applied watcher
  batch. But `subscribeIndexChanges` already calls `onApplied(changes)` with
  the exact changed note paths (`live.ts:162`). Every debounced save while
  typing in a daily note therefore refetches every mounted backlinks panel
  (one per visible day), the sidebar, recents, tasks, etc. — even queries that
  cannot have changed. TanStack structural sharing absorbs the *render* cost
  when data is unchanged, but the IPC round-trips and refetch scheduling are
  real and scale with the number of mounted index queries.
- **Already good (leave alone):** daily-stream scroll save is a ref write (no
  re-render); the stream is virtualized; the editor is uncontrolled with
  callbacks read through refs so prop identity never rebuilds extensions; the
  note session is keyed on a stable epoch so renames don't remount the editor.

## Approach

Run a parallel audit across the five hot paths to enumerate concrete,
behavior-preserving wins (file:line, fix, risk, confidence), explicitly
excluding PR #233's changes. Then implement only the high-confidence,
behavior-preserving subset, with focused tests.

## Acceptance criteria

- Real, scoped perf changes on the hot paths above; behavior/UX preserved.
- `pnpm check` (typecheck + lint) passes.
- Targeted `pnpm test --run` suites for touched logic pass.
- `pnpm --filter @reflect/desktop build` succeeds.
- `git diff --check origin/next...HEAD` clean.
- Docs: status.md, benchmarks.md, final-report.md; PR opened against `next`.

## Likely risks

- **Invalidation correctness:** narrowing invalidation must never leave a
  pane/list showing stale rows. Backlinks of note X change when a *different*
  note's outbound links change, so backlinks cannot be naively path-targeted.
  Mitigation: prefer coalescing/dedup and conservative scoping over aggressive
  targeting; keep list+backlinks fresh on any note change unless provably safe.
- **Editor remount regressions:** any change near `sessionEpoch`/`key` risks
  losing cursor/undo. Avoid unless provably safe.
- **No Rust toolchain on this machine** → cannot run the full Tauri app;
  verify via vitest + reasoning + EXPLAIN-style checks where applicable.

## Verification steps

- `pnpm typecheck`, `pnpm lint`, targeted `pnpm test --run`, desktop `build`.
- React-render reasoning + new unit tests around memoization/invalidation.
- `git diff --check`.

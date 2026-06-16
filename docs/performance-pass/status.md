# Performance Pass — Status

**Branch:** `claude/performance-pass-20260615`  
**Date:** 2026-06-15  
**Status:** Complete — all checks pass, PR open

---

## Work completed

| Area | Status | Files |
|---|---|---|
| React render memoization | Done | `all-notes-row.tsx`, `all-notes-table.tsx`, `all-notes-screen.tsx`, `backlinks-panel.tsx` |
| SQLite index coverage | Done | `crates/index-schema/migrations/0013_perf_indexes.sql`, `crates/index-schema/src/lib.rs` |
| Startup deferral | Done | `platform-root.tsx`, `graph-provider.tsx` |
| Documentation | Done | `docs/performance-pass/` |

---

## Checks

| Check | Result |
|---|---|
| `pnpm typecheck` | PASSED (5/5, 58 ms, all cached) |
| `pnpm lint` | PASSED (0 errors, 5 warnings — all pre-existing) |
| Targeted tests (3 suites) | PASSED (40/40 tests) |

---

## Remaining work (not in scope for this pass)

Items from the original plan that were not addressed:

- **P3** — mtime pre-filter in `indexer.ts` reconcile loop (skips hashing unchanged files). Highest non-addressed item; medium effort.
- **P5** — batch `applyIndexedNote` calls during reconcile.
- **P6** — in-memory `welcomeNoteEnsured` flag (the `graph-provider` change is a partial solution).
- **P7** — bounded-concurrency parallel `readNote` reads during reconcile.
- **P10** — virtualize `TasksScreen`.
- **P11** — parallelize `openGraph` + `index.open` (requires Rust change).
- **P12/P13** — store backlink snippets in the index.

These are tracked in `docs/performance-pass/plan.md` and can be picked up in a follow-on pass.

---

## CI Fix (2026-06-15)

Two Rust tests (`db::tests::migrations_are_valid_and_idempotent` and `db::tests::open_index_at_creates_migrates_and_reopens`) were asserting the migration version was 12, but migration `0013_perf_indexes.sql` added by this performance pass brought the count to 13. Updated both assertions to 13.

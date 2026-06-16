/Users/cloud/repos/team-reflect/reflect-open-performance-pass/docs/performance-pass/plan.md

The plan covers 13 specific fixes across five areas, each with exact file paths, line numbers, before/after code, acceptance criteria, risk rating, and a measurement approach. Prioritized order:

**P1–P3 (start here, highest impact/lowest risk):**
- P1: Three new partial SQL indexes (`notes_non_daily_mtime`, `notes_pinned`, `notes_conflict`) in a single migration file — no app code changes, fixes full-table scans on All Notes, sidebar, and conflict badge.
- P2: Replace the `getAppPlatform()` IPC call in `platform-root.tsx:29` with `import.meta.env.TAURI_ENV_PLATFORM` — removes one blocking round-trip from the startup critical path.
- P3: Add an mtime pre-filter in `indexer.ts:232` before `readNote` + `hashContent` — skips reading files that haven't changed since last index, turning O(N × filesize) reconcile into O(changed × filesize).

**P4–P7 (high value, minimal scope):**
- P4: `useMemo` around `groupBacklinksBySource` in `backlinks-panel.tsx:68` — 30-minute change.
- P5: Batch `applyIndexedNote` calls in reconcile using the existing `applyIndexedNotes` batch command.
- P6: In-memory `welcomeNoteEnsured` flag to skip the `ensureWelcomeNote` IPC on warm re-opens.
- P7: Bounded-concurrency parallel `readNote` reads during reconcile.

**P8–P13 (medium effort, medium payoff):**
- Stable callbacks + `React.memo` on `AllNotesRow`, virtualize `TasksScreen`, parallelize `openGraph`+`index.open` (requires Rust change), store backlink snippets in the index (eliminates N filesystem reads on note open).

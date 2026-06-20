# Performance Pass (2026-06-20) — Benchmarks & Measurement Guide

## Why there are no automated wall-clock numbers

The full app is a Tauri shell requiring a compiled Rust toolchain + the native
IPC bridge, which is not available on this machine (see project memory: no Rust
toolchain). The changes here are React-render optimizations whose effect is
measured with the React DevTools Profiler against a `pnpm dev` browser session,
or proven by the unit tests added in this pass. Each change below lists how to
observe it and what to expect.

All changes are behavior-preserving memoizations (no persistence, IPC, or
editor-lifecycle semantics changed), so the "before/after" is render/allocation
work avoided, not a behavior delta.

---

## 1. `NotePane` wrapped in `React.memo` (highest impact)

**File:** `apps/desktop/src/components/note-pane.tsx`

**Problem:** `NotePane` runs four hooks per instance — `useNoteDocument`,
`useImagePersistence`, `useEditorAutocomplete`, `useWikiLinkNavigation`. In the
daily stream one `NotePane` is mounted per visible day. The stream re-renders
whenever the virtualizer's visible-item set changes (scrolling rows in/out),
on a settings change, on navigation, and at the midnight `useToday` rollover.
Every such re-render previously re-executed all four hooks for **every** visible
day, even days whose props were unchanged.

**Fix:** `React.memo`. All props are reference-stable primitives or a
`useCallback`'d `onAutoFocused`, so unchanged rows skip the re-render entirely.
The `key={document.sessionEpoch}` editor-remount contract is unaffected: when
`path` changes the props differ, memo allows the re-render, and the session
machinery runs exactly as before.

**Measure:** React DevTools Profiler → record a scroll burst in the daily
stream. Before: every visible `NotePane` shows a commit on each scroll-driven
stream render. After: only rows entering/leaving the window commit; persistent
rows show "Did not render". Same applies to the mobile `day-carousel`.

---

## 2. `NotePreview` given a stable key in the command palette

**File:** `apps/desktop/src/components/command-palette/command-palette.tsx`

**Problem:** the preview pane was keyed `key={selectedNote.path}`, so every
↑/↓ arrow in the palette unmounted and remounted the entire preview subtree
(effect teardown/setup, `MarkdownPreview` rebuild) even though TanStack Query's
cache already had the data.

**Fix:** a constant `key="note-preview"`. The component stays mounted; the
`entry` prop updates and the query refetches by its own path-scoped key (cache
hit for already-seen notes). `NotePreview` holds no internal state, so this is
behavior-preserving.

**Measure:** Profiler → hold ↓ in an open palette with results. Before: a
mount+unmount pair per keypress. After: a single update.

---

## 3. `Snippet` memoized in the palette result list

**File:** `apps/desktop/src/components/command-palette/command-palette.tsx`

**Problem:** typing in the palette changes `query` each keystroke;
`buildPaletteSections` rebuilds `NoteEntry` objects, so each visible `Snippet`
re-ran `parseHighlights` even when its `snippet` string was identical.

**Fix:** `React.memo` on `Snippet` (pure, depends only on the `snippet` string).

**Measure:** Profiler → type into the palette; `Snippet` nodes show "Did not
render" when their text is unchanged.

---

## 4. `SidebarNoteRow` memoized (pinned shelf)

**File:** `apps/desktop/src/components/sidebar/sidebar-note-row.tsx`

**Problem:** the sidebar re-renders on every route change (it reads `useRouter`).
Each pinned row then re-ran `routeForPath` + `routesEqual` and rebuilt its
node, despite reference-stable primitive props from `usePinnedNotes`.

**Fix:** `React.memo`. Proven by `sidebar-note-row.test.tsx`: a parent re-render
with identical props does not re-run the row body.

---

## 5. `DayCalendar` lookup Set memoized

**File:** `apps/desktop/src/components/context-sidebar/day-calendar.tsx`

**Problem:** `const noted = new Set(notedDates ?? [])` allocated a fresh Set on
every render. The right sidebar re-renders as the focused day scrolls through
the stream, so within a stable month this allocated + GC'd a Set repeatedly.

**Fix:** `useMemo(() => new Set(notedDates ?? []), [notedDates])` — rebuilt only
when the query result actually changes (structural sharing keeps it stable
between unrelated re-renders).

---

## 6. `useSimilarNotes` result memoized

**File:** `apps/desktop/src/lib/use-similar-notes.ts`

**Problem:** the hook returned `(data ?? []).slice(0, 6)` — a new array on every
render even when the query result was reference-stable. A fresh array each
render defeats memoization in every consumer that takes it as a dependency.

**Fix:** wrap the slice in `useMemo([data, semanticSearchEnabled])`. Proven
reference-stable by `use-similar-notes.test.tsx`.

---

## Findings deliberately NOT taken (and why)

The audit surfaced and adversarially rejected several tempting changes:

- **Debouncing the global `invalidateIndexQueries`.** The Rust watcher already
  debounces at ~400 ms, so successive `onApplied` calls are already far apart on
  the typing path; a JS-side debounce would add staleness for no real gain.
- **Path-targeting / scoping index invalidation** (e.g. excluding backlinks,
  conflicted-notes, or duplicate-note-ids from the global invalidation). These
  index projections legitimately change during ordinary editing (typing a
  conflict marker, editing frontmatter ids, links changing a *different* note's
  backlinks), so narrowing the invalidation would show stale data. The global
  invalidation is correct; structural sharing already absorbs its render cost.
- **`useCallback`-only fixes on non-memoized list rows** (sidebar items,
  backlink groups, similar-notes rows). Stable callbacks do nothing without a
  memoized child; these were either no-ops or required `icon`/prop changes that
  added complexity for an already-tiny surface.

---

## Verification commands

```bash
# from repo root
pnpm typecheck                       # tsc --noEmit, all packages
pnpm lint                            # 0 errors (5 pre-existing warnings)
pnpm --filter @reflect/desktop build # vite build

# from apps/desktop (root `pnpm test` is a turbo wrapper that drops file args)
pnpm vitest run \
  src/lib/use-similar-notes.test.tsx \
  src/components/sidebar/sidebar-note-row.test.tsx \
  src/components/command-palette src/components/sidebar \
  src/components/context-sidebar src/components/daily-stream.test.tsx \
  src/components/backlinks-panel.test.tsx
```

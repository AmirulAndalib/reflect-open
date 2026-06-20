# Performance Pass (2026-06-20) — Real Benchmarks, Tier 2: Real Chromium

> **Supplements [`real-benchmarks.md`](./real-benchmarks.md).** That document
> covers the deterministic before/after render-count + commit-time evidence
> (Tier 1, Vitest/jsdom + a true `git checkout 7225f2e` baseline). This file
> adds the **real-browser** tier its caveats note is missing: the same memoized
> components driven in **Google Chrome / Chromium** via Playwright, measuring
> genuine browser React-commit time. Same before/after method (the five touched
> source files checked out at `7225f2e` for the baseline).

**Branch:** `claude/performance-pass-20260620` (PR #294)
**Head:** `1d08a2b` (memoized) vs baseline `7225f2e` (pre-memo)
**Raw numbers:** [`artifacts/real-browser-chromium.json`](./artifacts/real-browser-chromium.json)
**Harness screenshot:** [`artifacts/real-browser-chromium-harness.png`](./artifacts/real-browser-chromium-harness.png)

---

## Why a real browser at all

macOS Tauri renders in WKWebView, which CDP/Playwright/Chrome cannot attach to,
so the native shell is not browser-automatable. And every index read goes
through SQL-over-IPC (`db_query`) against the native SQLite index, so booting the
*whole* app in a plain browser would mean reimplementing that backend. The
faithful, automatable middle ground is to mount the **real** low-IPC components
(command palette, sidebar) in a real Chromium tab with in-memory fakes for the
providers, and measure real browser commit time. The two flows below are the
ones whose data needs are small enough for this; daily-stream-with-editor and
cold app load remain Tier-1 only.

## Harness

`apps/desktop/bench/web/` — a standalone Vite app (its own `vite.config.ts`) that:

- mounts the **real** `CommandPalette` (with the real `PaletteProvider`, `cmdk`,
  `parseHighlights`, and the stable-`key` `NotePreview` usage) and the **real**
  `SidebarNoteRow` shelf, under React `<Profiler>`s;
- replaces only the IPC-bound providers/leaves with fakes via Vite aliases +
  a small `resolveId` plugin (graph-provider, settings-provider,
  use-palette-results → the 50-result dataset, note-preview → a
  mount/effect-lifecycle stub);
- shares the production React-compiler plugin and the same
  `bench/lib/dataset.ts` fixture as Tier 1;
- exposes `window.__bench.{paletteType, paletteArrow, sidebarRerender}` so the
  Playwright driver runs each flow in-page and reads back
  `Profiler.actualDuration`, commit count, and wall time.

Driven through the Playwright "browser" tool against `http://localhost:5199`.
`actualDuration` (summed React commit time for the interaction) is the work
metric; `wallMs` includes `requestAnimationFrame` waits and is **not** the work
cost. Each flow: 1 warm-up + 3 measured runs, per revision.

## Results (real Google Chrome / Chromium)

| Flow | Tier-1 deterministic count (before→after) | Chromium commit time, pre-memo | Chromium commit time, memoized | Δ |
|---|---|---:|---:|---:|
| Palette typing — 10 keys, 50 results | `parseHighlights` 500 → 0 | ≈24.5 ms | ≈20.1 ms | **−18%** |
| Palette ↓ nav — 15 ArrowDown | `NotePreview` remounts 15 → 0 | ≈36.3 ms | ≈29.0 ms | **−20%** |
| Sidebar — 12 re-renders × 40 rows | row execs 480 → 0 | ≈19.9 ms | ≈20.3 ms | within noise |

Raw per-run triplets are in `artifacts/real-browser-chromium.json`.

### Reading these

- **Palette typing / arrow-nav:** the palette itself commits on every keystroke
  regardless of the memo (commit *count* is identical before/after), so the win
  shows up as **cheaper commits** — memoized `Snippet`s skip `parseHighlights`,
  and the stable key updates the preview in place instead of remounting it. The
  ~18–20% real-browser commit-time reduction is the wall-clock face of the
  deterministic 500→0 / 15→0 counts.
- **Sidebar:** at 40 rows the per-commit cost is small enough that real-browser
  wall-clock is dominated by run-to-run noise; the reliable signal there is the
  Tier-1 deterministic count (480 → 0). Reported honestly rather than dressed up.

## Reproduce

```bash
cd apps/desktop
npx vite --config bench/web/vite.config.ts        # serves http://localhost:5199
# In a real Chrome/Chromium tab (or via Playwright), once window.__bench.ready():
#   await window.__bench.paletteType(10)
#   await window.__bench.paletteArrow(15)
#   await window.__bench.sidebarRerender(12)
# For the baseline, first: git checkout 7225f2e -- <the 5 touched source files>,
# reload, re-measure, then: git checkout HEAD -- <those files>.
```

# Performance Pass (2026-06-20) — Native / Rust Retry

> **Why this file exists.** The earlier tiers
> ([`real-benchmarks.md`](./real-benchmarks.md),
> [`real-benchmarks-tier2-chromium.md`](./real-benchmarks-tier2-chromium.md))
> recorded *"Tauri shell: Not available (no Rust toolchain on this machine)"*.
> Alex asked to **install the Rust toolchain and retry the native/app path.**
> This doc records that retry: the toolchain is now installed, the entire Rust
> workspace builds + tests + lints clean, and a genuine **native read-path
> benchmark** (the `reflect` CLI against a real `index.sqlite`) was run. It
> supersedes the "no Rust toolchain" caveat in the two files above.

**Branch:** `claude/performance-pass-20260620` (PR #294)
**Raw artifacts:** [`artifacts/native/`](./artifacts/native/) —
[`native-read-path.json`](./artifacts/native/native-read-path.json),
[`toolchain-build-test-log.txt`](./artifacts/native/toolchain-build-test-log.txt),
plus the reproducible harness (`seed.rs`, `query_bench.rs`, `driver.py`).

---

## 0. The honest framing first

**PR #294 changes no native code.** Its diff (`7225f2e..HEAD`, confirmed via
`gh pr view 294`) is **React render memoizations + the benchmark harness +
docs** — zero `.rs`, zero `.sql`, zero migrations. The SQLite perf indexes some
might expect to find here (`0013_perf_indexes.sql`) landed in a *prior, already
merged* pass (#233), not this PR.

So there is **no native before/after to measure for PR #294** — claiming one
would be dishonest. What installing Rust *does* unlock, and what this retry
delivers truthfully, is:

1. The native side of the repo now **compiles, tests, and lints on this
   machine** for the first time (the prior pass had no toolchain).
2. A **fresh native read-path baseline** for the `reflect` CLI — the one native
   surface that is actually automatable on macOS.

## 1. Toolchain (fixed)

| | Before | After |
|---|---|---|
| `rustup` | **missing** (`command not found`) | **1.29.0**, default `stable-aarch64-apple-darwin` |
| `rustc` / `cargo` | 1.96.0 Homebrew only | 1.96.0 via rustup shims (`~/.cargo/bin` first on PATH); Homebrew left intact |
| `clippy` / `rustfmt` | n/a | installed (clippy 0.1.96, rustfmt 1.9.0) |
| `@tauri-apps/cli` | — | `tauri-cli 2.11.2` wired |

Installed non-interactively with `--profile minimal --no-modify-path` so the
existing Homebrew `rustc`/`cargo` are untouched; this shell prepends
`~/.cargo/bin`. Full transcript in
[`toolchain-build-test-log.txt`](./artifacts/native/toolchain-build-test-log.txt).

## 2. Workspace health (all green — new evidence)

| Check | Result |
|---|---|
| `cargo fmt --all -- --check` | clean |
| `cargo clippy --workspace` | **0 warnings / 0 errors** (35.8s) |
| `cargo test -p reflect-cli` | 20 + 4 parity passed |
| `cargo test -p reflect-index-schema` | 2 passed |
| `cargo test -p reflect-capture-host` | 22 passed |
| `cargo test -p reflect-open` (Tauri backend) | **117 passed**, 0 failed |
| **Total** | **165 native tests, 0 failed** |

Build timings (`/usr/bin/time -p`, warm registry):

| Target | Wall | Notes |
|---|---:|---|
| `reflect-cli` release | 15.35s | the CLI sidecar |
| desktop sidecar staging | 13.51s | `pnpm --filter @reflect/desktop sidecar` |
| `reflect-open` dev build | 52.84s | full Tauri backend (fastembed/ORT, vendored OpenSSL + libgit2) |
| `reflect-open` release build | 84.28s | same, optimized — **exit 0** |

The entire native backend — including the ONNX-runtime embedding stack, vendored
OpenSSL, and vendored libgit2 — compiles cleanly. This is precisely what the
prior pass could not verify.

## 3. Native read-path benchmark (`reflect` CLI)

### Why the CLI and not the app window

`pnpm tauri dev`/`build` render in **WKWebView**, which exposes no CDP endpoint,
so Playwright/Chrome DevTools cannot attach to the running app. **Installing Rust
does not change this** — it is a WebKit/macOS property, not a toolchain gap. The
faithful, automatable native surface is the `reflect` CLI: a real native binary
that opens the same `.reflect/index.sqlite` and runs the same FTS5 + title-boosted
bm25 ordering as the desktop palette (`search.rs` is kept in lockstep with
`filtered-search.ts`).

### Method

`seed.rs` builds a **non-stale** graph + `index.sqlite` from the *production*
migrations, reusing the CLI's own `hash_content`/`fold_key` so the index is
byte-shape-identical to what the desktop indexer writes (`reflect search` reports
`stale: false`). Three corpus sizes × three query selectivities. Two latencies:

- **end-to-end** — the full `reflect --json search` process: spawn → open →
  per-invocation staleness directory walk → FTS5 MATCH + bm25 → JSON → exit
  (`driver.py`, 5 warm-up + 40 runs, `time.perf_counter`);
- **query-only** — just `search_index` over a warm read-only connection
  (`query_bench.rs`, 50 warm-up + 5000 runs), isolating the SQLite cost.

Process-spawn floor (`reflect --version`): **p50 1.78 ms**.

### Results (real release binary, `--limit 20`)

| Corpus | Query (selectivity) | End-to-end p50 / p95 | Query-only p50 / p95 |
|---:|---|---:|---:|
| 1 000 | `kubernetes` (rare ~5%) | 4.75 / 5.09 ms | 140 / 145 µs |
| 1 000 | `database` (med ~20%) | 5.80 / 7.60 ms | 360 / 376 µs |
| 1 000 | `project` (common ~50%) | 5.95 / 6.36 ms | 1.06 / 1.10 ms |
| 5 000 | `kubernetes` | 13.87 / 17.21 ms | 866 / 899 µs |
| 5 000 | `database` | 14.43 / 17.09 ms | 2.01 / 2.11 ms |
| 5 000 | `project` | 18.33 / 21.05 ms | 5.75 / 5.97 ms |
| 20 000 | `kubernetes` | 50.07 / 54.16 ms | 3.72 / 4.01 ms |
| 20 000 | `database` | 55.12 / 58.38 ms | 8.79 / 9.84 ms |
| 20 000 | `project` | 72.97 / 76.65 ms | 24.1 / 25.7 ms |

### Reading these

- **The FTS5 + bm25 query itself is cheap** and scales with *selectivity*: a rare
  term over 20 000 notes ranks in ~3.7 ms; a term in half the corpus costs ~24 ms
  (bm25 has to score every matching row before `LIMIT 20`).
- **End-to-end is dominated by the per-invocation staleness directory walk, not
  the query.** At 20 000 notes the query is ~3.7 ms but the process takes ~50 ms;
  subtracting the ~1.8 ms spawn floor leaves ~44 ms in `open` + `detect_staleness`
  (which reads every `notes` row into a `HashMap` and walks all *N* files on disk
  *every* `search`). This is a deliberate, documented trade-off — `index.rs`:
  *"this check runs per `search` invocation"* — and a clear candidate for a future
  *native* optimization (throttle/skip the walk, or gate it on a cheap mtime
  summary). **It is out of scope for PR #294** (which is React-only); flagged here
  as the most actionable native finding this retry surfaced.

## 4. What was attempted and what was not

- **Done:** rustup install; `fmt`/`clippy`; full per-crate test suite; dev +
  release backend builds; sidecar staging; a real seeded-index CLI benchmark with
  raw artifacts and a reproducible harness.
- **Not feasible (with specificity):** driving the live Tauri window —
  WKWebView has no CDP endpoint on macOS, unchanged by the toolchain. A full
  `pnpm tauri build` bundle was not run: it only adds Vite-frontend + packaging/
  signing time on top of the release backend already measured here, and the
  resulting `.app` still renders in the unautomatable WKWebView, so it would add
  no measurement the table above doesn't already capture.

## Reproduce

```bash
# toolchain already installed; ensure shims are first:
export PATH="$HOME/.cargo/bin:$PATH"
cargo build -p reflect-cli --release      # builds target/release/reflect

# harness lives in artifacts/native/ (seed.rs, query_bench.rs, driver.py).
# Point a throwaway crate at apps/cli + crates/index-schema, then:
seed   /tmp/g 20000                        # writes notes/ + .reflect/index.sqlite
reflect --graph /tmp/g --json search project --limit 20
```

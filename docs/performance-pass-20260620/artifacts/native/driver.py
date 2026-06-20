#!/usr/bin/env python3
"""Native read-path benchmark for the `reflect` CLI.

Two latencies per (corpus size, query):
  * end-to-end: full `reflect ... search` process (spawn -> open -> staleness
    dir-walk -> FTS5 MATCH + bm25 -> JSON -> exit), the cost an integrating
    tool/script actually pays;
  * in-process query-only (query_bench): just search_index over a warm read-only
    connection, isolating the SQLite cost.
A process-spawn baseline (`reflect --version`) lets us attribute startup vs work.
"""
import json
import subprocess
import time
import statistics
import sys

REFLECT = "/Users/cloud/repos/team-reflect/reflect-open-worktrees/performance-pass-20260620/target/release/reflect"
QUERY_BENCH = "/tmp/reflect-bench-seed/target/release/query_bench"

SIZES = [1000, 5000, 20000]
QUERIES = [("kubernetes", "rare ~5%"), ("database", "medium ~20%"), ("project", "common ~50%")]
LIMIT = 20
WARMUP = 5
RUNS = 40


def time_cmd(argv, runs, warmup):
    for _ in range(warmup):
        subprocess.run(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    samples = []
    for _ in range(runs):
        t0 = time.perf_counter()
        subprocess.run(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        samples.append((time.perf_counter() - t0) * 1e3)  # ms
    samples.sort()
    return {
        "p50_ms": round(statistics.median(samples), 2),
        "p95_ms": round(samples[int(round((len(samples) - 1) * 0.95))], 2),
        "mean_ms": round(statistics.mean(samples), 2),
    }


def main():
    graphs = json.loads(sys.argv[1])  # {"1000": "/tmp/...", ...}
    out = {"limit": LIMIT, "runs": RUNS, "warmup": WARMUP, "spawn_baseline": {}, "results": []}

    # Process-spawn baseline (no index touched).
    out["spawn_baseline"] = time_cmd([REFLECT, "--version"], RUNS, WARMUP)

    for size in SIZES:
        graph = graphs[str(size)]
        for q, sel in QUERIES:
            e2e = time_cmd([REFLECT, "--graph", graph, "--json", "search", q, "--limit", str(LIMIT)], RUNS, WARMUP)
            qb = subprocess.run(
                [QUERY_BENCH, graph, q, str(LIMIT), "5000"],
                capture_output=True, text=True,
            ).stdout.strip().split("\t")
            out["results"].append({
                "size": size,
                "query": q,
                "selectivity": sel,
                "hits": int(qb[1]),
                "end_to_end": e2e,
                "query_only_us": {"p50": float(qb[2]), "p95": float(qb[3]), "mean": float(qb[4])},
            })
            print(f"size={size:>6} q={q:<11} hits={qb[1]:>3} "
                  f"e2e_p50={e2e['p50_ms']:>6}ms query_p50={float(qb[2]):>7.1f}us")

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()

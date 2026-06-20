//! In-process query-only latency for the CLI's exact search path. Opens the
//! seeded index read-only (as the CLI does) and times ONLY `search_index`
//! (FTS5 MATCH + title-boosted bm25 + ordering + snippet) over a warm
//! connection — isolating the SQLite read cost from process startup and the
//! per-invocation staleness directory walk.

use std::path::PathBuf;
use std::time::Instant;

use reflect_cli::index::{open_read_only, IndexOpen};
use reflect_cli::keys::fold_key;
use reflect_cli::search::{build_fts_match, search_index};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 5 {
        eprintln!("usage: query_bench <graph_dir> <query> <limit> <iters>");
        std::process::exit(2);
    }
    let root = PathBuf::from(&args[1]);
    let query = &args[2];
    let limit: usize = args[3].parse().unwrap();
    let iters: usize = args[4].parse().unwrap();

    let opened = match open_read_only(&root) {
        IndexOpen::Opened(o) => o,
        other => {
            eprintln!("index not opened: {}", match other {
                IndexOpen::Missing => "missing".into(),
                IndexOpen::Unusable(m) => m,
                _ => unreachable!(),
            });
            std::process::exit(4);
        }
    };
    let match_expr = build_fts_match(query).expect("non-empty query");
    let title_key = fold_key(query);

    // Warm-up.
    for _ in 0..50 {
        let _ = search_index(&opened.conn, &match_expr, &title_key, limit).unwrap();
    }

    let mut samples: Vec<f64> = Vec::with_capacity(iters);
    let mut last_n = 0usize;
    for _ in 0..iters {
        let t0 = Instant::now();
        let hits = search_index(&opened.conn, &match_expr, &title_key, limit).unwrap();
        let us = t0.elapsed().as_secs_f64() * 1e6;
        last_n = hits.len();
        samples.push(us);
    }
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let p = |q: f64| samples[((samples.len() as f64 - 1.0) * q).round() as usize];
    let mean = samples.iter().sum::<f64>() / samples.len() as f64;
    // query, hits, p50_us, p95_us, mean_us
    println!(
        "{}\t{}\t{:.1}\t{:.1}\t{:.1}",
        query, last_n, p(0.50), p(0.95), mean
    );
}

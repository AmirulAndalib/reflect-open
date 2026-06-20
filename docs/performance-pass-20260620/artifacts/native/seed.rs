//! Seed a realistic, NON-STALE Reflect graph + index.sqlite for native read-path
//! benchmarking. Reuses the CLI's real `hash_content`/`fold_key` and the
//! production migrations, so the seeded index is byte-identical in shape to what
//! the desktop indexer writes — `reflect search` runs against it unmodified.

use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use rusqlite::params;

use reflect_cli::hash::hash_content;
use reflect_cli::keys::fold_key;
use reflect_index_schema::open_index_at;

// Deterministic, dependency-free PRNG (no rand / Date needed).
struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 16
    }
    fn pick<'a, T>(&mut self, slice: &'a [T]) -> &'a T {
        &slice[(self.next() as usize) % slice.len()]
    }
}

const WORDS: &[&str] = &[
    "alpha", "beta", "gamma", "delta", "system", "design", "review", "notes",
    "graph", "index", "search", "query", "vector", "embedding", "markdown",
    "linking", "backlink", "daily", "journal", "meeting", "roadmap", "sprint",
    "ticket", "bug", "feature", "release", "deploy", "pipeline", "cache",
    "latency", "throughput", "memory", "profile", "render", "reconcile",
    "schema", "migration", "sqlite", "rusqlite", "tauri", "react", "hooks",
    "component", "palette", "sidebar", "calendar", "preview", "snippet",
    "frontmatter", "alias", "title", "heading", "content", "hashing", "sync",
    "remote", "branch", "commit", "merge", "conflict", "resolve", "watcher",
];

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: seed <graph_dir> <n_notes>");
        std::process::exit(2);
    }
    let root = PathBuf::from(&args[1]);
    let n: usize = args[2].parse().expect("n_notes must be an integer");

    let notes_dir = root.join("notes");
    fs::create_dir_all(&notes_dir).unwrap();

    // 1) Write N markdown files with searchable bodies. Selectivity tiers:
    //    "kubernetes" ~5% (rare), "database" ~20% (medium), "project" ~50% (common).
    let mut rng = Lcg(0x9e3779b97f4a7c15);
    struct Seeded {
        rel_path: String,
        title: String,
        body: String,
        mtime_ms: i64,
    }
    let mut seeded: Vec<Seeded> = Vec::with_capacity(n);
    for i in 0..n {
        let title = format!("{} {} {}", rng.pick(WORDS), rng.pick(WORDS), i);
        let mut body = String::with_capacity(400);
        body.push_str(&format!("# {title}\n\n"));
        for _ in 0..40 {
            body.push_str(rng.pick(WORDS));
            body.push(' ');
        }
        if i % 20 == 0 {
            body.push_str("kubernetes ");
        }
        if i % 5 == 0 {
            body.push_str("database ");
        }
        if i % 2 == 0 {
            body.push_str("project ");
        }
        body.push('\n');

        let rel_path = format!("notes/note-{i:06}.md");
        let abs = root.join(&rel_path);
        fs::write(&abs, &body).unwrap();
        // Read the file's real mtime back so notes.mtime matches → not stale.
        let mtime_ms = fs::metadata(&abs)
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        seeded.push(Seeded { rel_path, title, body, mtime_ms });
    }

    // 2) Build + migrate the real index, then insert the projection rows.
    let mut conn = open_index_at(&root).expect("open_index_at");
    let tx = conn.transaction().unwrap();
    for s in &seeded {
        let file_hash = hash_content(&s.body);
        let title_key = fold_key(&s.title);
        tx.execute(
            "INSERT INTO notes (path, title, title_key, file_hash, mtime, is_private, preview)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, '')",
            params![s.rel_path, s.title, title_key, file_hash, s.mtime_ms],
        )
        .unwrap();
        tx.execute(
            "INSERT INTO note_text (note_path, text) VALUES (?1, ?2)",
            params![s.rel_path, s.body],
        )
        .unwrap();
        tx.execute(
            "INSERT INTO search_fts (path, title, body) VALUES (?1, ?2, ?3)",
            params![s.rel_path, s.title, s.body],
        )
        .unwrap();
    }
    tx.commit().unwrap();
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); ANALYZE;").unwrap();

    println!("seeded {n} notes into {}", root.display());
}

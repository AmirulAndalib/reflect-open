/**
 * Git conflict-marker detection (Plan 12).
 *
 * A sync merge that conflicts writes standard markers into the note (labeled
 * `<<<<<<< this device` / `>>>>>>> other device` by the Rust merge) and
 * commits them — the note itself carries the conflict. The indexer calls this
 * on the raw source to project a `has_conflict` flag; when the user edits the
 * markers away, the next reindex clears it. Detection requires the full
 * `<<<<<<<` → `=======` → `>>>>>>>` sequence in order, so prose that merely
 * mentions a marker line doesn't false-positive.
 */

/** True when `source` contains a complete Git conflict-marker block. */
export function detectConflictMarkers(source: string): boolean {
  let stage: 'start' | 'separator' | 'end' = 'start'
  for (const rawLine of source.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    switch (stage) {
      case 'start':
        if (line.startsWith('<<<<<<< ')) {
          stage = 'separator'
        }
        break
      case 'separator':
        if (line === '=======') {
          stage = 'end'
        }
        break
      case 'end':
        if (line.startsWith('>>>>>>> ')) {
          return true
        }
        break
    }
  }
  return false
}

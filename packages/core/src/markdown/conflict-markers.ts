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

/** Which side of a conflict block to keep when resolving. */
export type ConflictResolution = 'ours' | 'theirs' | 'both'

/**
 * Resolve every conflict block in `source` by keeping one side (or both,
 * ours-then-theirs — the daily-note append case). Pure text splice on raw
 * lines, deliberately **never** routed through the editor: markers don't
 * survive its round-trip (verified by the Plan 12 spike), which is why
 * conflicted notes open protected and the UI resolves them through this.
 * Unterminated blocks (a truncated file) keep whatever was selected and never
 * throw. Text outside marker blocks is untouched, byte for byte.
 */
export function resolveConflictMarkers(source: string, keep: ConflictResolution): string {
  const out: string[] = []
  let section: 'text' | 'ours' | 'theirs' = 'text'
  for (const rawLine of source.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    switch (section) {
      case 'text':
        if (line.startsWith('<<<<<<< ')) {
          section = 'ours'
        } else {
          out.push(rawLine)
        }
        break
      case 'ours':
        if (line === '=======') {
          section = 'theirs'
        } else if (keep !== 'theirs') {
          out.push(rawLine)
        }
        break
      case 'theirs':
        if (line.startsWith('>>>>>>> ')) {
          section = 'text'
        } else if (keep !== 'ours') {
          out.push(rawLine)
        }
        break
    }
  }
  return out.join('\n')
}

/**
 * The two side labels of the first complete conflict block. Git sync labels
 * sides `this device` / `other device`; the iCloud sweep (Plan 21) labels
 * them with real device names (`Alex's MacBook Pro`) or, for creation
 * collisions, the two filenames the content came from. The resolution notice
 * uses these so its buttons say what they actually keep.
 */
export interface ConflictMarkerLabels {
  /** The first side — what {@link resolveConflictMarkers} keeps for `ours`. */
  ours: string
  /** The second side — kept for `theirs`. */
  theirs: string
}

/**
 * Parse the side labels out of `source`'s first complete conflict block, or
 * `null` when there is none. Same in-order sequence rule as
 * {@link detectConflictMarkers}, so a note that "has a conflict" always has
 * labels.
 */
export function conflictMarkerLabels(source: string): ConflictMarkerLabels | null {
  let ours: string | null = null
  let sawSeparator = false
  for (const rawLine of source.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (ours === null) {
      if (line.startsWith('<<<<<<< ')) {
        ours = line.slice('<<<<<<< '.length).trim()
      }
    } else if (!sawSeparator) {
      if (line === '=======') {
        sawSeparator = true
      }
    } else if (line.startsWith('>>>>>>> ')) {
      const theirs = line.slice('>>>>>>> '.length).trim()
      if (ours.length > 0 && theirs.length > 0) {
        return { ours, theirs }
      }
      return null
    }
  }
  return null
}

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

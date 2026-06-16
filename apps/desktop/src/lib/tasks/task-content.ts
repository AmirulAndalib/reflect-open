import { parseTaskMarker } from '@reflect/core'

/**
 * A task's content — its source line ({@link OpenTask.raw}) minus the leading
 * `[ ]`/`[x]` marker and the one space after it — kept as **markdown** (links
 * and tags intact) so the inline editor can edit it and {@link TaskText} can
 * render its chips. Derived through {@link parseTaskMarker}, the shared marker
 * grammar, not a regex: `raw` always begins with the three-character marker (the
 * list bullet precedes it in the file, not in `raw`), so we validate those three
 * chars and slice past them. A `raw` that somehow isn't a marker returns
 * verbatim — the projection only stores real task lines, so that's defensive.
 */
export function taskContent(raw: string): string {
  if (parseTaskMarker(raw.slice(0, 3)) === null) {
    return raw
  }
  const rest = raw.slice(3)
  // One separating space (or tab) follows the marker on a normal task line.
  return rest[0] === ' ' || rest[0] === '\t' ? rest.slice(1) : rest
}

/** What committing the inline editor should do with `current` vs the `initial` seed. */
export type TaskEditResult =
  | { type: 'commit'; content: string }
  | { type: 'cancel' }
  | { type: 'delete' }

/**
 * Decide the outcome of finishing an inline task edit (Plan 18). Whitespace-only
 * differences don't count, so re-selecting and tabbing away never rewrites the
 * file; clearing the content deletes the task (V1's empty-task behavior); any
 * other change commits the trimmed content.
 */
export function resolveTaskEdit(initial: string, current: string): TaskEditResult {
  const content = current.trim()
  if (content === initial.trim()) {
    return { type: 'cancel' }
  }
  if (content === '') {
    return { type: 'delete' }
  }
  return { type: 'commit', content }
}

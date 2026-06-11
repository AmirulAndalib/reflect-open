import type { Editor } from '@prosekit/core'
import { createMeowdownEditor, parseMarkdown, serializeMarkdown } from './meowdown'

/**
 * Round-trip safety guard (Plan 05b). Markdown is the durable source of truth,
 * so before the save pipeline is allowed to rewrite a note, we verify the
 * editor can actually reproduce it. meowdown is pre-1.0 and its converter has
 * known gaps — setext headings lose their text, raw HTML blocks and
 * reference-link/footnote definitions are dropped — and a converter gap must
 * degrade to a protected, read-only note, never to silently rewriting the
 * user's file minus the content the editor couldn't model.
 */

export type RoundTripFidelity =
  /** Byte-identical (modulo the serializer's single trailing newline). */
  | 'exact'
  /**
   * Same content, different blank-line layout — meowdown serializes lists
   * tight, so a loose source list loses its blank lines. Editing is safe
   * (nothing is lost), but a save will reformat.
   */
  | 'normalizing'
  /** Content would be lost or altered. The note must not be auto-rewritten. */
  | 'lossy'

let probe: Editor | null = null

function probeEditor(): Editor {
  probe ??= createMeowdownEditor('')
  return probe
}

function contentLines(markdown: string): string {
  return markdown
    .split('\n')
    .filter((line) => line !== '')
    .join('\n')
}

/** Classify how faithfully the editor round-trips `markdown`. */
export function checkRoundTrip(markdown: string): RoundTripFidelity {
  const output = serializeMarkdown(parseMarkdown(probeEditor(), markdown))
  if (output.replace(/\n+$/, '') === markdown.replace(/\n+$/, '')) {
    return 'exact'
  }
  // List normalization only changes blank-line layout; if the sequence of
  // non-blank lines is unchanged, no content was gained or lost.
  if (contentLines(output) === contentLines(markdown)) {
    return 'normalizing'
  }
  return 'lossy'
}

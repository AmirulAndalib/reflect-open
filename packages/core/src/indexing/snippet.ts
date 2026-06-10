/**
 * Line-level context extraction for the backlinks panel (Plan 07): given a
 * note's source and a link's whole-file offset (the index stores `pos_from`
 * with the frontmatter offset already applied), return the surrounding line,
 * trimmed around the position when the line runs long.
 */

const DEFAULT_MAX_LENGTH = 160

/** The single line of `content` containing `pos`, windowed to `maxLength`. */
export function lineSnippet(content: string, pos: number, maxLength = DEFAULT_MAX_LENGTH): string {
  const at = Math.max(0, Math.min(pos, content.length))
  const lineStart = content.lastIndexOf('\n', Math.max(0, at - 1)) + 1
  const lineEndRaw = content.indexOf('\n', at)
  const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw
  const line = content.slice(lineStart, lineEnd).trim()
  if (line.length <= maxLength) {
    return line
  }
  // Window around the link's position within the line so the link text — the
  // reason this line is shown at all — stays visible.
  const posInLine = at - lineStart
  const half = Math.floor(maxLength / 2)
  const from = Math.max(0, Math.min(posInLine - half, line.length - maxLength))
  const to = from + maxLength
  const prefix = from > 0 ? '…' : ''
  const suffix = to < line.length ? '…' : ''
  return `${prefix}${line.slice(from, to).trim()}${suffix}`
}

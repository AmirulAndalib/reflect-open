import { parseBody } from './grammar'

/**
 * Inline scanning for the editor (Plan 05). The editor decorates `[[wiki
 * links]]` and renders `![images](…)` inside text blocks; these scanners reuse
 * the **one canonical Lezer grammar** (shared with the indexer) so the editor
 * and the index can never disagree on what counts as a link or image —
 * including code contexts: `[[target]]` or `![x](y)` inside a code span is
 * literal text in both worlds.
 */

/** One `[[target]]` / `[[target|alias]]` occurrence within a scanned text. */
export interface InlineWikiLink {
  /** Span of the whole `[[…]]`, offsets relative to the scanned text. */
  from: number
  to: number
  target: string
  alias: string | null
  /** Span of the display text (the alias when present, else the target). */
  displayFrom: number
  displayTo: number
}

/** One `![alt](src)` image occurrence within a scanned text. */
export interface InlineImage {
  /** Span of the whole `![…](…)`, offsets relative to the scanned text. */
  from: number
  to: number
  alt: string
  src: string
}

// `![alt](src)`, tolerating a "title" suffix and <bracketed> src — the same
// shape extract.ts accepts for the index.
const IMAGE_RE = /^!\[([^\]]*)\]\(\s*(<[^>]*>|\S+?)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)$/

/**
 * Find every inline image in a block's text content. Offsets are relative to
 * the input string; the caller maps them into document positions.
 */
export function scanInlineImages(text: string): InlineImage[] {
  if (!text.includes('![')) {
    return []
  }
  const images: InlineImage[] = []
  parseBody(text).iterate({
    enter: (node) => {
      if (node.name !== 'Image') {
        return true
      }
      const match = IMAGE_RE.exec(text.slice(node.from, node.to))
      if (match) {
        images.push({
          from: node.from,
          to: node.to,
          alt: match[1],
          src: match[2].replace(/^<|>$/g, ''),
        })
      }
      return false
    },
  })
  return images
}

/**
 * Find every wiki link in a block's text content. Offsets are relative to the
 * input string; the caller maps them into document positions.
 */
export function scanInlineWikiLinks(text: string): InlineWikiLink[] {
  if (!text.includes('[[')) {
    return [] // cheap pre-filter — most blocks have no wiki links
  }
  const links: InlineWikiLink[] = []
  parseBody(text).iterate({
    enter: (node) => {
      if (node.name !== 'WikiLink') {
        return true
      }
      const { from, to } = node
      const inner = text.slice(from + 2, to - 2)
      const pipe = inner.indexOf('|')
      const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim()
      const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim() || null
      // Display text: the alias segment when a real alias exists, else the
      // target segment — a blank alias (`[[target|  ]]`) falls back to target.
      const displayFrom = alias !== null ? from + 2 + pipe + 1 : from + 2
      const displayTo = alias !== null ? to - 2 : from + 2 + (pipe === -1 ? inner.length : pipe)
      links.push({ from, to, target, alias, displayFrom, displayTo })
      return false
    },
  })
  return links
}

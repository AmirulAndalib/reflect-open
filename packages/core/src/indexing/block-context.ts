import type { SyntaxNode } from '@lezer/common'
import { splitFrontmatter } from '../markdown/frontmatter'
import { parseBody } from '../markdown/grammar'
import { unescapeMarkdownText } from '../markdown/plain-text'
import { normalizeWikiTarget } from '../markdown/resolve'
import { lineAt } from './snippet'

/**
 * Block-level context extraction for the backlinks panel, ported from old
 * Reflect's `getBacklinkContextHtml`. Where {@link lineAt} returns only the
 * physical line around a link, this walks the parsed block structure and
 * returns the whole unit of meaning the mention sits in:
 *
 * - **Paragraph** — the whole paragraph (which may wrap across lines).
 * - **Heading** — the heading plus every following sibling block up to the
 *   next heading (of any level) or the end of the section's parent.
 * - **Top-level list item** — the entire item including all of its nested
 *   children (sub-bullets, task lists), mentioning or not.
 * - **Nested list item** — the parent item's own text line for context, plus
 *   each sibling branch under that parent that also mentions the same target;
 *   branches that don't mention it are dropped. Only one ancestor level is
 *   climbed, exactly like old Reflect.
 *
 * The result is Markdown sliced from the source (full lines, dedented to the
 * context's own indentation) so nested structure survives rendering, and is
 * never truncated — old Reflect showed the full context and clamped the panel,
 * not the snippet.
 */

const HEADING_NODE_RE = /^(?:ATXHeading|SetextHeading)[1-6]$/

function isHeadingName(name: string): boolean {
  return HEADING_NODE_RE.test(name)
}

/** Leaf blocks that hold inline content (GFM turns a task item's paragraph into `Task`). */
function isTextblockName(name: string): boolean {
  return name === 'Paragraph' || name === 'Task'
}

function isListName(name: string): boolean {
  return name === 'BulletList' || name === 'OrderedList'
}

function selfOrAncestor(
  node: SyntaxNode | null,
  matches: (node: SyntaxNode) => boolean,
): SyntaxNode | null {
  for (let current = node; current; current = current.parent) {
    if (matches(current)) {
      return current
    }
  }
  return null
}

/** The normalized match key of a `[[…]]` node, or `null` for a blank target. */
function wikiTargetKeyOf(body: string, link: SyntaxNode): string | null {
  const inner = body.slice(link.from + 2, link.to - 2)
  const pipe = inner.indexOf('|')
  const target = unescapeMarkdownText((pipe === -1 ? inner : inner.slice(0, pipe)).trim())
  return target === '' ? null : normalizeWikiTarget(target).key
}

/** Does the textblock's inline content hold a wiki link with this match key? */
function textblockMentions(body: string, block: SyntaxNode, targetKey: string): boolean {
  for (let child = block.firstChild; child; child = child.nextSibling) {
    if (child.name === 'WikiLink') {
      if (wikiTargetKeyOf(body, child) === targetKey) {
        return true
      }
    } else if (textblockMentions(body, child, targetKey)) {
      return true // links nested in emphasis/strikethrough still count
    }
  }
  return false
}

/**
 * Does a candidate branch (a sibling list item or block under the parent item)
 * mention the target in its *direct* text blocks? Deeper descendants don't
 * qualify the branch — old Reflect's `nodeHasDirectBacklink` looked exactly one
 * block deep, and each mention deeper down produces its own context anyway.
 */
function branchMentions(body: string, branch: SyntaxNode, targetKey: string | null): boolean {
  if (targetKey === null) {
    return false
  }
  if (isTextblockName(branch.name)) {
    return textblockMentions(body, branch, targetKey)
  }
  for (let child = branch.firstChild; child; child = child.nextSibling) {
    if (isTextblockName(child.name) && textblockMentions(body, child, targetKey)) {
      return true
    }
  }
  return false
}

function lineStartAt(body: string, pos: number): number {
  return body.lastIndexOf('\n', Math.max(0, pos - 1)) + 1
}

function lineEndAt(body: string, pos: number): number {
  const next = body.indexOf('\n', pos)
  return next === -1 ? body.length : next
}

/**
 * The full lines covering `[from, to)`, with the first line's prefix (the text
 * before `from` — indentation, or `> ` inside a blockquote) stripped from every
 * line it also leads. Keeps deeper indentation relative, so a sliced list still
 * renders nested.
 */
function sliceLines(body: string, from: number, to: number): string {
  const prefix = body.slice(lineStartAt(body, from), from)
  const end = to > from && body[to - 1] === '\n' ? to - 1 : to
  const lines = body.slice(from, lineEndAt(body, end)).split('\n')
  const dedented = lines.map((line, index) => {
    if (index === 0) {
      return line // starts at `from`, already past the prefix
    }
    return prefix !== '' && line.startsWith(prefix) ? line.slice(prefix.length) : line
  })
  return dedented.join('\n').trimEnd()
}

/** The heading's section: itself plus siblings until the next heading of any level. */
function headingSectionEnd(heading: SyntaxNode): number {
  let end = heading.to
  for (let sibling = heading.nextSibling; sibling; sibling = sibling.nextSibling) {
    if (isHeadingName(sibling.name)) {
      break
    }
    end = sibling.to
  }
  return end
}

/** The item's first block child when it is a text block (its own bullet line). */
function leadTextblock(item: SyntaxNode): SyntaxNode | null {
  for (let child = item.firstChild; child; child = child.nextSibling) {
    if (child.name === 'ListMark' || child.name === 'TaskMarker') {
      continue
    }
    return isTextblockName(child.name) ? child : null
  }
  return null
}

function containsPos(node: SyntaxNode, pos: number): boolean {
  return node.from <= pos && pos < node.to
}

/**
 * Context for a mention inside a list item, per old Reflect's rules: a
 * top-level item yields its whole subtree; a nested item yields the parent
 * item's own line plus the branches under it that mention the same target
 * (always including the branch the mention itself sits in).
 */
function listItemContext(
  body: string,
  item: SyntaxNode,
  targetKey: string | null,
  bodyPos: number,
): string {
  const parentItem = selfOrAncestor(item.parent, (node) => node.name === 'ListItem')
  const lead = parentItem ? leadTextblock(parentItem) : null
  if (!parentItem || !lead) {
    return sliceLines(body, item.from, item.to)
  }

  const indent = body.slice(lineStartAt(body, parentItem.from), parentItem.from)
  const pieces: string[] = [sliceLines(body, parentItem.from, lead.to)]
  for (let child = lead.nextSibling; child; child = child.nextSibling) {
    const branches = isListName(child.name) ? child.getChildren('ListItem') : [child]
    for (const branch of branches) {
      if (branchMentions(body, branch, targetKey) || containsPos(branch, bodyPos)) {
        pieces.push(dedentBranch(body, branch, indent))
      }
    }
  }
  return pieces.join('\n')
}

/** A branch's full lines with the *parent* item's indentation stripped, keeping one nesting level. */
function dedentBranch(body: string, branch: SyntaxNode, indent: string): string {
  const from = lineStartAt(body, branch.from)
  const end = branch.to > branch.from && body[branch.to - 1] === '\n' ? branch.to - 1 : branch.to
  const lines = body.slice(from, lineEndAt(body, end)).split('\n')
  const dedented = lines.map((line) =>
    indent !== '' && line.startsWith(indent) ? line.slice(indent.length) : line,
  )
  return dedented.join('\n').trimEnd()
}

/**
 * The Markdown block context around the link at whole-file offset `pos` (the
 * index's `pos_from`, frontmatter offset included) — see the module doc for
 * the shape per mention location. Falls back to the physical line when the
 * offset has drifted out of any block (the source changed between the index
 * write and this read).
 */
export function blockContextAt(content: string, pos: number): string {
  const { body, bodyOffset } = splitFrontmatter(content)
  const bodyPos = Math.max(0, Math.min(pos - bodyOffset, body.length))
  const tree = parseBody(body)
  const leaf: SyntaxNode = tree.resolveInner(bodyPos, 1)

  const link = selfOrAncestor(leaf, (node) => node.name === 'WikiLink')
  const targetKey = link ? wikiTargetKeyOf(body, link) : null

  const heading = selfOrAncestor(leaf, (node) => isHeadingName(node.name))
  if (heading) {
    return sliceLines(body, heading.from, headingSectionEnd(heading))
  }

  const item = selfOrAncestor(leaf, (node) => node.name === 'ListItem')
  if (item) {
    return listItemContext(body, item, targetKey, bodyPos)
  }

  const block = selfOrAncestor(leaf, (node) => isTextblockName(node.name))
  if (block) {
    return sliceLines(body, block.from, block.to)
  }

  // Not inside a text block: a table cell, or an offset drifted into the gap
  // between blocks. Use the nearest top-level block, else the bare line.
  const top = selfOrAncestor(leaf, (node) => node.parent?.name === 'Document')
  if (top) {
    return sliceLines(body, top.from, top.to)
  }
  return lineAt(content, pos)
}

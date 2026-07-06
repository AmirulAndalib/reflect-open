import type { ReactElement } from 'react'
import { MarkdownView } from '@meowdown/react'
import type { WikilinkClickHandler } from '@meowdown/core'
import { openExternalLink } from '@/editor/open-external-link'

interface BacklinkSnippetProps {
  /** The referencing block context's Markdown source (may span several lines). */
  text: string
  /** Navigate a clicked `[[wiki link]]` to its target. Pass a stable function. */
  onWikilinkClick: WikilinkClickHandler
  /** Resolve `![…](…)` sources to displayable URLs. Pass a stable function. */
  resolveImageUrl: (src: string) => string | undefined
}

/**
 * One reference in the incoming-backlinks panel, rendered as rich text through
 * meowdown's editor-free `MarkdownView`: wiki links become the editor's
 * clickable chips and inline marks render instead of raw `[[…]]` / `**…**`
 * source. The context is a whole block (old Reflect's rules — a paragraph, the
 * containing list item with its children, or a heading's section), so it
 * renders unclamped: truncating would cut the nested structure the context
 * exists to show. The `reflect-editor` class shares the editor's chip styling;
 * the `reflect-backlink-snippet` wrapper keeps it in the panel's compact line box.
 */
export function BacklinkSnippet({
  text,
  onWikilinkClick,
  resolveImageUrl,
}: BacklinkSnippetProps): ReactElement {
  return (
    <div className="reflect-backlink-snippet select-text text-xs text-text">
      <MarkdownView
        className="reflect-editor"
        markdown={text}
        onWikilinkClick={onWikilinkClick}
        onLinkClick={openExternalLink}
        resolveImageUrl={resolveImageUrl}
      />
    </div>
  )
}

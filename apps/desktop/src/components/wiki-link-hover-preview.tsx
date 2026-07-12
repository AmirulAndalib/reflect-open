import type { ReactElement } from 'react'
import { dateFromDailyPath, type DateFormat } from '@reflect/core'
import { MarkdownPreview } from '@/editor/markdown-preview'
import { formatDayLabel } from '@/lib/dates'

interface WikiLinkHoverPreviewProps {
  path: string
  /** The note body with frontmatter already stripped. */
  markdown: string
  dateFormat: DateFormat
  resolveImageUrl: (src: string) => string | null
}

/**
 * Reflect's passive body for Meowdown's wiki-link hover card. Meowdown owns
 * the card chrome, sizing, and lifecycle; this renders only the content, from
 * a snapshot read at hover time.
 */
export function WikiLinkHoverPreview({
  path,
  markdown,
  dateFormat,
  resolveImageUrl,
}: WikiLinkHoverPreviewProps): ReactElement {
  const dailyDate = dateFromDailyPath(path)
  const empty = markdown.trim().length === 0

  return (
    <div className="p-3 text-xs text-popover-foreground" data-testid="wiki-link-hover-preview">
      {dailyDate !== null ? (
        <div className="reflect-daily-subject mb-2 text-base">
          {formatDayLabel(dailyDate, dateFormat)}
        </div>
      ) : null}
      {empty ? (
        <p className="text-text-muted">Empty note</p>
      ) : (
        <MarkdownPreview
          content={markdown}
          resolveImageUrl={resolveImageUrl}
          interactive={false}
          className="text-xs leading-relaxed"
        />
      )}
    </div>
  )
}

import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getNote, hasBridge } from '@reflect/core'
import { InlineAlert } from '@/components/inline-alert'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'

interface SyncConflictNoticeProps {
  /** Graph-relative path of the open note. */
  path: string
  className?: string
}

/**
 * The `Needs review` banner on a note whose file carries sync conflict
 * markers (a backup merge where this and another device edited the same
 * note, Plan 12). The flag is a projection of the file content, so the
 * banner clears itself once the user edits the markers away and the save
 * reindexes — there is nothing to dismiss.
 */
export function SyncConflictNotice({ path, className }: SyncConflictNoticeProps): ReactElement | null {
  const { graph } = useGraph()
  const { data } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, 'note-conflict', graph?.root, path],
    queryFn: async () => (await getNote(path)) ?? null,
    enabled: hasBridge() && graph !== null,
  })
  if (data == null || !data.hasConflict) {
    return null
  }
  return (
    <InlineAlert tone="warning" className={className}>
      This note was edited on two devices at once. Both versions are below, between{' '}
      <code>{'<<<<<<<'}</code> and <code>{'>>>>>>>'}</code> lines — keep what you want, delete
      the rest (including the marker lines), and this notice will clear on save.
    </InlineAlert>
  )
}

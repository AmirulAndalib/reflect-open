import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage, type NoteListEntry } from '@reflect/core'
import { deleteOpenNote } from '@/lib/note-delete'
import { startOperation } from '@/lib/operations'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'
import { allNotesListPrefix } from './all-notes-query'

export interface NoteTrash {
  /**
   * Trash the given notes, resolving `true` when **every** note went to the
   * trash and `false` when any could not. Failures — a per-note error or a
   * missing graph — are reported through the operations toast
   * ({@link startOperation}), the app's standard channel for background work,
   * rather than thrown: the caller only needs to know whether it fully
   * succeeded (to clear the selection) and can close its confirm either way.
   */
  trash: (paths: readonly string[]) => Promise<boolean>
  isTrashing: boolean
}

/**
 * Bulk-trash for the All Notes screen: send a selection of notes to the trash
 * and drop them from the list immediately.
 *
 * - **Optimistic removal is required, not cosmetic.** On desktop the list only
 *   refreshes when the file watcher's reindex batch applies — a visible beat
 *   after the delete. The single-note action sidesteps this by navigating away;
 *   the bulk action stays on the screen, so it removes the rows from every
 *   cached list variant (the `all-notes` key prefix — a trashed note leaves
 *   every tag view) up front, then lets the watcher reconcile. On any failure
 *   it invalidates to refetch truth: notes that didn't trash reappear.
 * - **{@link deleteOpenNote}, not raw `deleteNote`.** It discards any open
 *   editor session for the note after the file is gone, so a teardown flush
 *   can't recreate the file. It also guards daily notes (which All Notes never
 *   lists, so this is only defense in depth).
 * - **Per-note failures don't strand the rest.** Deletes run sequentially and a
 *   failure is recorded, not rethrown mid-batch, so the remaining notes still
 *   trash; the toast reports the count couldn't-trash via the last error.
 */
export function useNoteTrash(): NoteTrash {
  const { graph } = useGraph()
  const queryClient = useQueryClient()
  const [isTrashing, setIsTrashing] = useState(false)

  const trash = useCallback(
    async (paths: readonly string[]): Promise<boolean> => {
      if (paths.length === 0) {
        return true
      }
      const generation = graph?.generation
      const root = graph?.root
      if (generation === undefined || root === undefined) {
        // No graph to trash into — report it; never a silent success.
        startOperation('Trashing notes').fail('No graph is open.')
        return false
      }
      const removing = new Set(paths)
      const operation = startOperation('Trashing notes')
      setIsTrashing(true)
      queryClient.setQueriesData<NoteListEntry[]>(
        { queryKey: allNotesListPrefix(root) },
        (rows) => rows?.filter((row) => !removing.has(row.path)),
      )
      let failures = 0
      let lastError: unknown = null
      try {
        operation.progress(0, paths.length)
        let attempted = 0
        for (const path of paths) {
          try {
            await deleteOpenNote(path, generation)
          } catch (cause) {
            failures += 1
            lastError = cause
          }
          attempted += 1
          operation.progress(attempted, paths.length)
        }
        if (failures > 0) {
          operation.fail(errorMessage(lastError))
          // Reconcile to truth: notes that failed (still on disk) reappear, the
          // ones that were trashed stay gone.
          void queryClient.invalidateQueries({ queryKey: [INDEX_QUERY_SCOPE] })
          return false
        }
        operation.done()
        return true
      } finally {
        setIsTrashing(false)
      }
    },
    [graph, queryClient],
  )

  return { trash, isTrashing }
}

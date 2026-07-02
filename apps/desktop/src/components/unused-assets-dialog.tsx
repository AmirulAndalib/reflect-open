import { useCallback, useEffect, useState, useSyncExternalStore, type ReactElement } from 'react'
import { toast } from 'sonner'
import { deleteAsset, errorMessage, openAsset, unusedAssets, type FileMeta } from '@reflect/core'
import { InlineAlert } from '@/components/inline-alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBytes } from '@/lib/format-bytes'
import { useGraph } from '@/providers/graph-provider'

// The palette command opens the dialog from outside the React tree, so the
// open flag is a module store (the `operations.ts` shape), not pane state.
let isOpen = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

/** Open the unused-assets report (the `graph.unusedAssets` command). */
export function openUnusedAssetsDialog(): void {
  isOpen = true
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Null while the scan is in flight (the dialog shows "Scanning…"). */
type Listing =
  | { status: 'ready'; files: FileMeta[] }
  | { status: 'error'; message: string }
  | null

/**
 * The unused-assets report: files under `assets/` that no note links to,
 * largest first, each with an explicit open-or-delete choice — v1 orphaned
 * uploads invisibly on a server; here they're plain files a user can see and
 * reclaim. Deletion goes to the OS trash, never a hard delete, and nothing
 * is ever removed automatically. Mounted once at the app root.
 */
export function UnusedAssetsDialog(): ReactElement {
  const open = useSyncExternalStore(subscribe, () => isOpen)
  const { graph } = useGraph()
  const generation = graph?.generation ?? null
  const [listing, setListing] = useState<Listing>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    // Only asynchronous state updates here; the null listing already renders
    // as the scanning state, and closing resets it in the change handler.
    let stale = false
    void (async () => {
      let scanned: Listing
      try {
        scanned = {
          status: 'ready',
          files: generation === null ? [] : await unusedAssets(generation),
        }
      } catch (cause) {
        scanned = { status: 'error', message: errorMessage(cause) }
      }
      if (!stale) {
        setListing(scanned)
      }
    })()
    return () => {
      stale = true
    }
  }, [open, generation])

  const handleOpen = useCallback(
    (path: string) => {
      if (generation === null) {
        return
      }
      // A per-file failure must not wipe the listing the user is working
      // through — the scan is still valid; only this action failed.
      void openAsset(path, generation).catch((cause) => {
        toast.error(errorMessage(cause))
      })
    },
    [generation],
  )

  const handleDelete = useCallback(
    async (path: string) => {
      if (generation === null) {
        return
      }
      try {
        await deleteAsset(path, generation)
        setListing((current) =>
          current !== null && current.status === 'ready'
            ? { status: 'ready', files: current.files.filter((file) => file.path !== path) }
            : current,
        )
      } catch (cause) {
        toast.error(errorMessage(cause))
      }
    },
    [generation],
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        isOpen = next
        emit()
        if (!next) {
          setListing(null)
        }
      }}
    >
      <DialogContent>
        <DialogTitle>Unused assets</DialogTitle>
        <DialogDescription>
          Files in assets/ that no note links to. Delete moves to the Trash.
        </DialogDescription>
        {listing === null ? (
          <p className="text-sm text-text-muted">Scanning…</p>
        ) : listing.status === 'error' ? (
          <InlineAlert tone="error">{listing.message}</InlineAlert>
        ) : listing.files.length === 0 ? (
          <p className="text-sm text-text-muted">No unused assets.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {listing.files.map((file) => {
              const name = file.path.replace(/^assets\//, '')
              return (
                <li key={file.path} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="shrink-0 text-text-muted">{formatBytes(file.size)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Open ${name}`}
                    onClick={() => handleOpen(file.path)}
                  >
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${name}`}
                    onClick={() => void handleDelete(file.path)}
                  >
                    Delete
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}

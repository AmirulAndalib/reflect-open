import { useSyncExternalStore } from 'react'

/**
 * The app-global large-file confirm (the same store-plus-subscriber shape as
 * `operations.ts`). A confirm is modal by nature — one dialog, whoever asks —
 * so the pending question lives here rather than in pane state, where a
 * reused pane instance once leaked confirms across note and graph switches.
 * `LargeAttachmentDialog`, mounted once at the app root, mirrors this store.
 */

/**
 * Above this size, saving a pasted/dropped/picked file pauses on a confirm.
 * Not a wall — it's the user's disk — but git backup is the quiet
 * constraint: every binary lives in history forever, and GitHub hard-rejects
 * files over 100 MB.
 */
export const LARGE_FILE_BYTES = 25 * 1024 * 1024

/** A file waiting on the user's go-ahead; drives the confirm dialog. */
export interface LargeFileConfirm {
  file: File
  /** Resolve the paused save: `true` writes the file, `false` drops it. */
  respond: (proceed: boolean) => void
}

let pending: LargeFileConfirm | null = null
/** Confirms that arrived while one was showing, oldest first. */
let waiting: Array<() => void> = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

/**
 * Ask the user to approve saving a large file. Resolves `true` to proceed,
 * `false` when declined (dismissing the dialog declines). Concurrent asks
 * queue behind the single dialog slot in arrival order. `isStale`, when
 * given, is checked as the confirm's turn comes up: a stale ask resolves
 * declined without showing — a dialog for a note the user already left
 * would be a question with no good answer.
 */
export function confirmLargeFile(file: File, isStale?: () => boolean): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const show = (): void => {
      if (isStale?.()) {
        resolve(false)
        waiting.shift()?.()
        return
      }
      pending = {
        file,
        respond: (proceed) => {
          pending = null
          waiting.shift()?.()
          emit()
          resolve(proceed)
        },
      }
      emit()
    }
    if (pending === null) {
      show()
    } else {
      waiting.push(show)
    }
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The confirm currently awaiting an answer, for the dialog. */
export function useLargeFileConfirm(): LargeFileConfirm | null {
  return useSyncExternalStore(subscribe, () => pending)
}

/** Test seam: decline everything pending and queued. */
export function resetLargeFileConfirms(): void {
  const queued = waiting
  waiting = []
  pending?.respond(false)
  for (const show of queued) {
    show()
    pending?.respond(false)
  }
}

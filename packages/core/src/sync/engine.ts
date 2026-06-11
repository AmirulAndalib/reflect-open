import { isAppError } from '../errors'
import {
  gitCommitAll,
  gitFetch,
  gitMergeRemote,
  gitPush,
  type SkippedFile,
} from './commands'

/**
 * The sync engine (Plan 12): debounced commit→push on edit, pull/merge/retry
 * on divergence, every failure mapped to a product state. Git mechanics never
 * reach the UI — only {@link SyncStatus}.
 *
 * Invariants:
 * - **Never wedged.** Merges commit their conflicts (markers in the note), so
 *   a conflict pauses nothing; the indexer surfaces `Needs review` per note.
 * - **No write loops.** Pull-applied file changes do re-enter `noteChanged`
 *   via the watcher, but the next `git_commit_all` sees a clean tree and
 *   no-ops; nothing re-pushes.
 * - **Single flight.** One cycle at a time; edits landing mid-cycle schedule
 *   a fresh one rather than interleaving.
 */

/** The product states. `pending` = offline with changes queued locally. */
export interface SyncStatus {
  state: 'idle' | 'syncing' | 'pending' | 'error'
  /** Human-readable detail for `pending`/`error`. */
  message?: string
  /** What kind of error (drives the UI affordance: reconnect vs. show). */
  errorKind?: 'auth' | 'rejected' | 'other'
}

export interface SyncEngineOptions {
  /** The graph generation every git command is pinned to. */
  generation: number
  /** Resolves the remote credential; `null` = none connected (auth error). */
  getToken: () => Promise<string | null>
  onStatus?: (status: SyncStatus) => void
  /** Surfaced when the size guardrail withholds files from backup. */
  onLargeFilesSkipped?: (files: SkippedFile[]) => void
  /** Quiet period after the last edit before a backup commit. */
  idleMs?: number
  /** Ceiling on deferral while the user keeps typing. */
  maxWaitMs?: number
}

export interface SyncEngine {
  /** Mark the graph dirty (watcher file-change event); debounced. */
  noteChanged(): void
  /** Full cycle now — commit, pull/merge, push. For launch/focus/manual. */
  syncNow(): Promise<void>
  /** Cancel timers; in-flight work finishes but nothing new schedules. */
  stop(): void
}

const DEFAULT_IDLE_MS = 30_000
const DEFAULT_MAX_WAIT_MS = 5 * 60_000

/**
 * Push attempts per cycle. Each retry fetches + merges first, so two devices
 * racing converge fast; a remote advancing faster than we can merge for three
 * straight rounds is pathological enough to surface.
 */
const MAX_PUSH_ATTEMPTS = 3

/** A push the remote refused for a non-divergence reason (e.g. push protection). */
class PushRejectedError extends Error {}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS

  let timer: ReturnType<typeof setTimeout> | null = null
  /** Hard deadline (first unflushed edit + maxWaitMs); null = nothing pending. */
  let deadline: number | null = null
  let running: Promise<void> | null = null
  let rerun = false
  let stopped = false

  function emit(status: SyncStatus): void {
    options.onStatus?.(status)
  }

  function schedule(delayMs: number): void {
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      void run('push')
    }, delayMs)
  }

  function noteChanged(): void {
    if (stopped) {
      return
    }
    const now = Date.now()
    if (deadline === null) {
      deadline = now + maxWaitMs
    }
    // Wait for the idle window, but never past the deadline — a continuously
    // edited graph still backs up at least every maxWaitMs.
    schedule(Math.max(0, Math.min(idleMs, deadline - now)))
  }

  async function run(mode: 'push' | 'full'): Promise<void> {
    if (stopped) {
      return
    }
    if (running !== null) {
      rerun = true
      return running
    }
    running = (async () => {
      emit({ state: 'syncing' })
      try {
        await cycle(mode)
        emit({ state: 'idle' })
      } catch (error) {
        emit(statusForError(error))
      } finally {
        deadline = null
        running = null
        if (rerun && !stopped) {
          rerun = false
          noteChanged()
        }
      }
    })()
    return running
  }

  async function cycle(mode: 'push' | 'full'): Promise<void> {
    const token = await options.getToken()
    const commit = await gitCommitAll('Update notes', options.generation)
    if (commit.skippedLargeFiles.length > 0) {
      options.onLargeFilesSkipped?.(commit.skippedLargeFiles)
    }
    if (mode === 'full') {
      // Launch/focus: pick up other devices' changes even with nothing to push.
      await gitFetch(token, options.generation)
      await gitMergeRemote(options.generation) // upToDate is a no-op
    }
    for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
      const push = await gitPush(token, options.generation)
      if (push.pushed) {
        return
      }
      if (!push.nonFastForward) {
        throw new PushRejectedError(push.rejectionMessage ?? 'the remote rejected the backup')
      }
      // The normal two-device race: another device pushed first. Converge and
      // retry — a conflicted merge still commits (markers in the note).
      await gitFetch(token, options.generation)
      await gitMergeRemote(options.generation)
    }
    throw new PushRejectedError(
      'the backup repo kept changing while syncing; will retry on the next edit',
    )
  }

  function syncNow(): Promise<void> {
    return run('full')
  }

  function stop(): void {
    stopped = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return { noteChanged, syncNow, stop }
}

function statusForError(error: unknown): SyncStatus {
  if (error instanceof PushRejectedError) {
    return { state: 'error', errorKind: 'rejected', message: error.message }
  }
  if (isAppError(error)) {
    if (error.kind === 'network') {
      return {
        state: 'pending',
        message: 'Offline — changes are saved locally and will back up when you reconnect',
      }
    }
    if (error.kind === 'auth') {
      return { state: 'error', errorKind: 'auth', message: error.message }
    }
    return { state: 'error', errorKind: 'other', message: error.message }
  }
  return {
    state: 'error',
    errorKind: 'other',
    message: error instanceof Error ? error.message : String(error),
  }
}

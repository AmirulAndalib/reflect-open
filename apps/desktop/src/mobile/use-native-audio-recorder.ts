import { useCallback, useEffect, useRef, useState } from 'react'
import { addPluginListener, invoke } from '@tauri-apps/api/core'
import { base64ToBytes } from '@reflect/core'
import { z } from 'zod'

/**
 * The mobile counterpart of `use-audio-recorder.ts`: the same
 * status/start/stop/cancel surface over the native recorder plugin
 * (`plugins/tauri-plugin-recording`) instead of the webview's MediaRecorder.
 * Capture is native by design (the V1 lesson): AVAudioRecorder writes
 * straight into a staging directory the plugin owns, and interruptions,
 * route loss, backgrounding, and the duration cap all finalize the file
 * without JS — this hook only *presents* recording state and hands finished
 * files to the capture pipeline.
 *
 * Instead of a `MediaStream` for the waveform, the plugin streams ~10 Hz
 * `recordingLevel` events; the latest level and elapsed time are exposed as
 * plain state.
 */

export type NativeRecorderStatus = 'idle' | 'requesting' | 'recording'

/** All recordings are AAC in an `.m4a` container (see RecordingPlugin.swift). */
export const NATIVE_RECORDING_MIME = 'audio/mp4'

/** Below this a recording is a misclick, not a memo (desktop parity). */
const MIN_DURATION_MS = 500

export interface NativeRecorderResult {
  blob: Blob
  mimeType: string
  durationMs: number
  /** The staged file's absolute path — delete it once the blob is durable. */
  stagedPath: string
}

export interface UseNativeAudioRecorderOptions {
  /** Auto-stop cap, enforced natively so it holds even if JS never wakes. */
  maxDurationMs: number
  /**
   * A stop the native side initiated (interruption, route change,
   * backgrounding, the cap): the file is already staged — treat it exactly
   * like a user stop. `null` when the recording was too short to keep.
   */
  onNativeStop: (result: NativeRecorderResult | null) => void
}

export interface UseNativeAudioRecorderValue {
  status: NativeRecorderStatus
  /** Live while recording; 0 otherwise. */
  elapsedMs: number
  /** Latest input level 0…1, for the waveform. */
  level: number
  /** Ask for the microphone and start recording. Rejects when denied. */
  start: () => Promise<void>
  /** Stop and read back the recording — `null` for one too short to keep. */
  stop: () => Promise<NativeRecorderResult | null>
  /** Stop and discard everything. */
  cancel: () => Promise<void>
}

const stopResponseSchema = z.object({ path: z.string(), durationMs: z.number() })
const readStagedSchema = z.object({ base64: z.string() })
const levelEventSchema = z.object({ level: z.number(), elapsedMs: z.number() })
const stoppedEventSchema = z.object({
  path: z.string(),
  durationMs: z.number(),
  reason: z.string(),
})

/**
 * Staged files a live flow (a stop in flight, a queued capture) already owns.
 * The orphan scan consults this so a file can never be ingested twice — once
 * by the stop that produced it and once by a scan racing the await gaps in
 * between. Module scope: one recorder surface per app, and claims must
 * survive a provider remount mid-capture.
 */
const claimedStagedPaths = new Set<string>()

/** Claim a staged file for a live capture flow. */
export function claimStagedPath(path: string): void {
  claimedStagedPaths.add(path)
}

/** Release a claim — after deletion, or so the orphan scan can retry it. */
export function releaseStagedPath(path: string): void {
  claimedStagedPaths.delete(path)
}

/** True when a live flow owns the staged file. */
export function isStagedPathClaimed(path: string): boolean {
  return claimedStagedPaths.has(path)
}

/** True when the native recorder rejected `start` because access was denied. */
export function isMicDeniedError(cause: unknown): boolean {
  return typeof cause === 'string'
    ? cause.includes('denied')
    : cause instanceof Error && cause.message.includes('denied')
}

/** Read a staged recording back as the pipeline's blob. */
export async function readStagedRecording(path: string): Promise<Blob> {
  const raw = await invoke('plugin:recording|read_staged', { request: { path } })
  const { base64 } = readStagedSchema.parse(raw)
  return new Blob([base64ToBytes(base64)], { type: NATIVE_RECORDING_MIME })
}

/** Remove a staged recording once its bytes are durable in the graph. */
export async function deleteStagedRecording(path: string): Promise<void> {
  await invoke('plugin:recording|delete_staged', { request: { path } })
}

export function useNativeAudioRecorder(
  options: UseNativeAudioRecorderOptions,
): UseNativeAudioRecorderValue {
  const [status, setStatus] = useState<NativeRecorderStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [level, setLevel] = useState(0)

  // Read at fire time, not captured at subscribe — the host's callback
  // identity changes across renders.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })
  const statusRef = useRef<NativeRecorderStatus>('idle')
  const setStatusBoth = useCallback((next: NativeRecorderStatus): void => {
    statusRef.current = next
    setStatus(next)
    if (next !== 'recording') {
      setElapsedMs(0)
      setLevel(0)
    }
  }, [])
  /** Guards the stop/cancel invoke gap — mirrors the desktop hook's guard. */
  const stopPromiseRef = useRef<Promise<NativeRecorderResult | null> | null>(null)

  // The plugin's event stream is subscribed for the hook's whole life: level
  // events are ignored unless recording, and a native stop must be heard even
  // if it lands between renders.
  useEffect(() => {
    let disposed = false
    const unlisteners: Array<() => void> = []
    void (async () => {
      try {
        const levelListener = await addPluginListener(
          'recording',
          'recordingLevel',
          (raw: unknown) => {
            const parsed = levelEventSchema.safeParse(raw)
            if (parsed.success && statusRef.current === 'recording') {
              setLevel(parsed.data.level)
              setElapsedMs(parsed.data.elapsedMs)
            }
          },
        )
        const stoppedListener = await addPluginListener(
          'recording',
          'recordingStopped',
          (raw: unknown) => {
            const parsed = stoppedEventSchema.safeParse(raw)
            if (!parsed.success) {
              return
            }
            setStatusBoth('idle')
            const { path, durationMs } = parsed.data
            claimStagedPath(path)
            void (async () => {
              if (durationMs < MIN_DURATION_MS) {
                await deleteStagedRecording(path).catch(() => {})
                releaseStagedPath(path)
                optionsRef.current.onNativeStop(null)
                return
              }
              try {
                const blob = await readStagedRecording(path)
                optionsRef.current.onNativeStop({
                  blob,
                  mimeType: NATIVE_RECORDING_MIME,
                  durationMs,
                  stagedPath: path,
                })
              } catch (cause) {
                // Reading it back failed — leave the file staged (released,
                // so the orphan scan ingests it on the next launch or
                // foreground instead).
                releaseStagedPath(path)
                console.error('reading a native-stopped recording failed:', cause)
              }
            })()
          },
        )
        if (disposed) {
          void levelListener.unregister()
          void stoppedListener.unregister()
          return
        }
        unlisteners.push(
          () => void levelListener.unregister(),
          () => void stoppedListener.unregister(),
        )
      } catch (cause) {
        console.error('recording plugin events unavailable:', cause)
      }
    })()
    return () => {
      disposed = true
      for (const unlisten of unlisteners.splice(0)) {
        unlisten()
      }
    }
  }, [setStatusBoth])

  const start = useCallback(async (): Promise<void> => {
    if (statusRef.current !== 'idle') {
      return
    }
    setStatusBoth('requesting')
    try {
      await invoke('plugin:recording|start_recording', {
        request: { maxDurationMs: optionsRef.current.maxDurationMs },
      })
    } catch (cause) {
      setStatusBoth('idle')
      throw cause
    }
    setStatusBoth('recording')
  }, [setStatusBoth])

  const stop = useCallback((): Promise<NativeRecorderResult | null> => {
    if (stopPromiseRef.current !== null) {
      return stopPromiseRef.current
    }
    if (statusRef.current !== 'recording') {
      return Promise.resolve(null)
    }
    const stopped = (async (): Promise<NativeRecorderResult | null> => {
      const raw = await invoke('plugin:recording|stop_recording')
      setStatusBoth('idle')
      const { path, durationMs } = stopResponseSchema.parse(raw)
      claimStagedPath(path)
      if (durationMs < MIN_DURATION_MS) {
        await deleteStagedRecording(path).catch(() => {})
        releaseStagedPath(path)
        return null
      }
      try {
        const blob = await readStagedRecording(path)
        return { blob, mimeType: NATIVE_RECORDING_MIME, durationMs, stagedPath: path }
      } catch (cause) {
        // Leave the file for the orphan scan rather than losing the memo.
        releaseStagedPath(path)
        throw cause
      }
    })().finally(() => {
      stopPromiseRef.current = null
    })
    stopPromiseRef.current = stopped
    return stopped
  }, [setStatusBoth])

  const cancel = useCallback(async (): Promise<void> => {
    // Also aborts a pending permission request natively (start-session bump).
    try {
      await invoke('plugin:recording|cancel_recording')
    } finally {
      setStatusBoth('idle')
    }
  }, [setStatusBoth])

  return { status, elapsedMs, level, start, stop, cancel }
}

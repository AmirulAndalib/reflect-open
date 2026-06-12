import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Microphone recording for audio memos: stream acquisition, the MediaRecorder
 * lifecycle, and elapsed time — nothing else. The waveform taps the exposed
 * stream itself, and transcription belongs to the audio-memo provider, so this
 * stays testable with two small global stubs.
 */

export type RecorderStatus = 'idle' | 'requesting' | 'recording'

export interface RecorderResult {
  blob: Blob
  /** The container the recorder actually produced (codec parameters intact). */
  mimeType: string
  durationMs: number
}

export interface UseAudioRecorderOptions {
  /** Auto-stop guard: `onMaxDuration` fires once when a recording reaches this. */
  maxDurationMs?: number
  /** Called when the cap is hit — the host decides what stopping means. */
  onMaxDuration?: () => void
}

export interface UseAudioRecorderValue {
  status: RecorderStatus
  /** Live while recording; 0 otherwise. */
  elapsedMs: number
  /** The live input stream, for waveform visualization. */
  stream: MediaStream | null
  /** Ask for the microphone and start recording. Rejects when access is denied. */
  start: () => Promise<void>
  /** Stop and assemble the recording — `null` for one too short to be a memo. */
  stop: () => Promise<RecorderResult | null>
  /** Stop and discard everything. */
  cancel: () => void
}

/**
 * Preference order matters per platform: Chrome/WebView2 take the opus-in-webm
 * entries; WKWebView supports none of them and falls through to `audio/mp4`
 * (AAC). Both containers are accepted by the transcription providers.
 */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

/** Below this a recording is a misclick, not a memo. */
const MIN_DURATION_MS = 500

const ELAPSED_TICK_MS = 200

const FALLBACK_MIME_TYPE = 'audio/mp4'

function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate))
}

/** True when the platform exposes the recording APIs this hook needs. */
export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderValue {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read at fire time, not captured at start — the host's callback identity
  // changes across renders.
  const optionsRef = useRef(options)
  optionsRef.current = options
  // Bumped by cancel/unmount so an in-flight getUserMedia resolves into a dead
  // session and releases the mic instead of recording into the void.
  const sessionRef = useRef(0)

  const teardown = useCallback((): void => {
    sessionRef.current += 1
    recorderRef.current = null
    chunksRef.current = []
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (maxTimeoutRef.current !== null) {
      clearTimeout(maxTimeoutRef.current)
      maxTimeoutRef.current = null
    }
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    streamRef.current = null
    setStream(null)
    setElapsedMs(0)
    setStatus('idle')
  }, [])

  const start = useCallback(async (): Promise<void> => {
    if (recorderRef.current !== null || streamRef.current !== null) {
      return
    }
    const session = sessionRef.current
    setStatus('requesting')
    let input: MediaStream
    try {
      input = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (cause) {
      setStatus('idle')
      throw cause
    }
    if (sessionRef.current !== session) {
      for (const track of input.getTracks()) {
        track.stop()
      }
      return
    }

    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(input, mimeType ? { mimeType } : undefined)
    chunksRef.current = []
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }
    recorder.start()

    recorderRef.current = recorder
    streamRef.current = input
    startedAtRef.current = Date.now()
    intervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, ELAPSED_TICK_MS)
    const maxDurationMs = optionsRef.current.maxDurationMs
    if (maxDurationMs !== undefined) {
      maxTimeoutRef.current = setTimeout(() => {
        optionsRef.current.onMaxDuration?.()
      }, maxDurationMs)
    }
    setStream(input)
    setStatus('recording')
  }, [])

  const stop = useCallback(async (): Promise<RecorderResult | null> => {
    const recorder = recorderRef.current
    if (recorder === null) {
      teardown()
      return null
    }
    const durationMs = Date.now() - startedAtRef.current
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })
    const mimeType = recorder.mimeType || pickMimeType() || FALLBACK_MIME_TYPE
    const blob = new Blob(chunksRef.current, { type: mimeType })
    teardown()
    if (durationMs < MIN_DURATION_MS || blob.size === 0) {
      return null
    }
    return { blob, mimeType, durationMs }
  }, [teardown])

  const cancel = useCallback((): void => {
    const recorder = recorderRef.current
    if (recorder !== null && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    teardown()
  }, [teardown])

  // Never leave the mic open past unmount.
  useEffect(() => cancel, [cancel])

  return { status, elapsedMs, stream, start, stop, cancel }
}

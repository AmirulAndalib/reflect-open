import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRecordingSupported, useAudioRecorder } from './use-audio-recorder'

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = []
  static supported = ['audio/mp4']

  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supported.includes(type)
  }

  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  state: RecordingState = 'inactive'
  readonly mimeType: string

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? ''
    FakeMediaRecorder.instances.push(this)
  }

  start(): void {
    this.state = 'recording'
  }

  stop(): void {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio-bytes']) })
    this.onstop?.()
  }
}

interface FakeTrack {
  stop: () => void
}

function fakeStream(tracks: FakeTrack[]): MediaStream {
  return { getTracks: () => tracks } as unknown as MediaStream
}

const getUserMedia = vi.fn<() => Promise<MediaStream>>()

beforeEach(() => {
  FakeMediaRecorder.instances = []
  FakeMediaRecorder.supported = ['audio/mp4']
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  getUserMedia.mockReset()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useAudioRecorder', () => {
  it('records with the first supported container and assembles the result', async () => {
    const track = { stop: vi.fn() }
    getUserMedia.mockResolvedValue(fakeStream([track]))
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.start()
    })
    expect(result.current.status).toBe('recording')
    expect(result.current.stream).not.toBeNull()
    // WKWebView profile: webm unsupported, mp4 picked.
    expect(FakeMediaRecorder.instances[0].mimeType).toBe('audio/mp4')

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.elapsedMs).toBe(3000)

    const recording = await act(async () => result.current.stop())
    expect(recording).not.toBeNull()
    expect(recording?.mimeType).toBe('audio/mp4')
    expect(recording?.durationMs).toBe(3000)
    expect(recording?.blob.size).toBeGreaterThan(0)
    expect(track.stop).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(result.current.elapsedMs).toBe(0)
  })

  it('prefers opus-in-webm where the platform supports it', async () => {
    FakeMediaRecorder.supported = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    getUserMedia.mockResolvedValue(fakeStream([{ stop: vi.fn() }]))
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.start()
    })
    expect(FakeMediaRecorder.instances[0].mimeType).toBe('audio/webm;codecs=opus')
  })

  it('discards a sub-half-second recording as a misclick', async () => {
    getUserMedia.mockResolvedValue(fakeStream([{ stop: vi.fn() }]))
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    const recording = await act(async () => result.current.stop())
    expect(recording).toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('cancel stops the tracks and discards without a result', async () => {
    const track = { stop: vi.fn() }
    getUserMedia.mockResolvedValue(fakeStream([track]))
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.start()
    })
    act(() => {
      result.current.cancel()
    })
    expect(result.current.status).toBe('idle')
    expect(result.current.stream).toBeNull()
    expect(track.stop).toHaveBeenCalled()
  })

  it('rethrows a permission denial and returns to idle', async () => {
    getUserMedia.mockRejectedValue(new Error('Permission denied'))
    const { result } = renderHook(() => useAudioRecorder())

    await expect(
      act(async () => {
        await result.current.start()
      }),
    ).rejects.toThrow('Permission denied')
    expect(result.current.status).toBe('idle')
  })

  it('a cancel during the permission prompt releases the stream it resolves into', async () => {
    const track = { stop: vi.fn() }
    let release: (stream: MediaStream) => void = () => {}
    getUserMedia.mockImplementation(
      () =>
        new Promise<MediaStream>((resolve) => {
          release = resolve
        }),
    )
    const { result } = renderHook(() => useAudioRecorder())

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.start()
    })
    expect(result.current.status).toBe('requesting')
    act(() => {
      result.current.cancel()
    })
    await act(async () => {
      release(fakeStream([track]))
      await pending
    })
    expect(track.stop).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(FakeMediaRecorder.instances).toHaveLength(0)
  })

  it('fires onMaxDuration once when the cap is reached', async () => {
    getUserMedia.mockResolvedValue(fakeStream([{ stop: vi.fn() }]))
    const onMaxDuration = vi.fn()
    const { result } = renderHook(() =>
      useAudioRecorder({ maxDurationMs: 1000, onMaxDuration }),
    )

    await act(async () => {
      await result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(onMaxDuration).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onMaxDuration).toHaveBeenCalledTimes(1)
  })

  it('stopping before the cap disarms it', async () => {
    getUserMedia.mockResolvedValue(fakeStream([{ stop: vi.fn() }]))
    const onMaxDuration = vi.fn()
    const { result } = renderHook(() =>
      useAudioRecorder({ maxDurationMs: 1000, onMaxDuration }),
    )

    await act(async () => {
      await result.current.start()
    })
    await act(async () => {
      await result.current.stop()
    })
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onMaxDuration).not.toHaveBeenCalled()
  })

  it('unmount releases the microphone', async () => {
    const track = { stop: vi.fn() }
    getUserMedia.mockResolvedValue(fakeStream([track]))
    const { result, unmount } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.start()
    })
    unmount()
    expect(track.stop).toHaveBeenCalled()
  })
})

describe('isRecordingSupported', () => {
  it('requires both MediaRecorder and getUserMedia', () => {
    expect(isRecordingSupported()).toBe(true)
    vi.stubGlobal('navigator', {})
    expect(isRecordingSupported()).toBe(false)
  })
})

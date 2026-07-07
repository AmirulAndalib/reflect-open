import type { ReactElement } from 'react'
import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { useMobileAudioMemo } from '@/mobile/audio-memo-provider'
import { RecordingLevelWaveform } from '@/mobile/recording-level-waveform'

/**
 * The recording sheet (V1's recording modal as a bottom drawer): waveform +
 * elapsed time with a stop control while recording, and the capture-failure
 * state with Retry/Discard. Dragging the sheet down mid-recording
 * stops-and-saves — dismissal must never silently drop audio; discarding is
 * the explicit Cancel control. The provider owns open state and the
 * stop/cancel semantics behind `onDrawerOpenChange`.
 */
export function RecordingDrawer(): ReactElement {
  const memo = useMobileAudioMemo()

  return (
    <Drawer open={memo.drawerOpen} onOpenChange={memo.onDrawerOpenChange}>
      <DrawerContent aria-label="Audio memo">
        <DrawerTitle className="sr-only">Audio memo</DrawerTitle>
        {memo.error !== null ? (
          <div className="flex flex-col gap-3 px-2 pb-2">
            <p className="text-sm text-destructive">{memo.error}</p>
            <div className="flex gap-2">
              {memo.canRetry ? (
                <Button variant="secondary" onClick={() => memo.retry()}>
                  Retry
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => memo.discard()}>
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 pb-2">
            <div className="flex h-7 items-center justify-center">
              {memo.phase === 'recording' ? (
                <RecordingLevelWaveform level={memo.level} />
              ) : (
                <p className="text-sm text-text-muted">Waiting for the microphone…</p>
              )}
            </div>
            <span className="text-lg font-medium tabular-nums">
              {formatElapsed(memo.elapsedMs)}
            </span>
            <div className="flex w-full flex-col items-center gap-2">
              <Button
                variant="destructive"
                size="icon"
                aria-label="Stop recording"
                className="size-14 rounded-full"
                disabled={memo.phase !== 'recording'}
                onClick={() => memo.stopAndSave()}
              >
                <Square aria-hidden fill="currentColor" className="size-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => memo.cancelRecording()}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

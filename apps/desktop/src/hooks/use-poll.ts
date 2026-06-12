import { useEffect, useRef } from 'react'

/**
 * Run `tick` every `intervalMs` while `enabled`, starting one interval after
 * enablement (callers typically just ran the same check inline). Ticks never
 * overlap — the next wait starts when the previous tick settles — and a tick
 * that throws keeps the loop alive: the network checks this exists for fail
 * transiently. Return 'stop' to end the loop. Disabling or unmounting
 * cancels future ticks but not one already in flight.
 */
export function usePoll(
  enabled: boolean,
  intervalMs: number,
  tick: () => Promise<'continue' | 'stop'>,
): void {
  // Always call the latest tick without re-arming the timer every render.
  const tickRef = useRef(tick)
  tickRef.current = tick

  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function schedule(): void {
      timer = setTimeout(() => {
        void tickRef.current().then(
          (result) => {
            if (!cancelled && result === 'continue') {
              schedule()
            }
          },
          () => {
            if (!cancelled) {
              schedule()
            }
          },
        )
      }, intervalMs)
    }

    schedule()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled, intervalMs])
}

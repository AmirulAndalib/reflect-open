import { useEffect, useRef, type RefObject } from 'react'

export interface ArrivalFocusOptions {
  /** The router's navigation counter — bumped on every `navigate`. */
  arrivalSeq: number
  /** Whether the latest navigation asked the destination to focus its input. */
  arrivalFocusEditor: boolean
  /** The element a focus arrival should focus. */
  target: RefObject<HTMLElement | null>
}

/**
 * Focus `target` on capture arrivals (`navigate(..., { focusEditor: true })`
 * — the All-tab double-tap landing on the search input). Mirrors
 * `useDailyArrivals`' bookkeeping: each arrival is consumed once, and the
 * arrival that mounts the screen still counts — the double-tap's second
 * navigate can land before the remounting screen first commits, so waiting
 * for a seq *change* would silently swallow the gesture.
 */
export function useArrivalFocus({
  arrivalSeq,
  arrivalFocusEditor,
  target,
}: ArrivalFocusOptions): void {
  const seenSeq = useRef<number | null>(null)
  useEffect(() => {
    const newArrival = seenSeq.current !== arrivalSeq
    seenSeq.current = arrivalSeq
    if (newArrival && arrivalFocusEditor) {
      target.current?.focus()
    }
  }, [arrivalSeq, arrivalFocusEditor, target])
}

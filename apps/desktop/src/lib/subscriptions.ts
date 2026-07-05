/**
 * Collects unlisten/dispose functions — including ones acquired *async* —
 * and guarantees none leak past disposal: a subscription that resolves after
 * {@link SubscriptionTracker.disposeAll} ran is torn down on the spot. Every
 * effect that awaits a `listen(...)` otherwise re-derives this same
 * disposed-flag dance (StrictMode's probe mount makes the race routine).
 */
export interface SubscriptionTracker {
  /** Track an async subscription; resolves once it's tracked (or torn down). */
  add: (subscription: Promise<() => void>) => Promise<void>
  /** Track an already-acquired dispose function. */
  track: (dispose: () => void) => void
  /** Tear everything down; late-resolving `add`s dispose immediately. */
  disposeAll: () => void
}

/** Create an empty tracker (one per effect run; dispose in the cleanup). */
export function trackSubscriptions(): SubscriptionTracker {
  let disposed = false
  const disposers: Array<() => void> = []
  const track = (dispose: () => void): void => {
    if (disposed) {
      dispose()
    } else {
      disposers.push(dispose)
    }
  }
  return {
    track,
    add: (subscription) => subscription.then(track),
    disposeAll: () => {
      disposed = true
      for (const dispose of disposers) {
        dispose()
      }
      disposers.length = 0
    },
  }
}

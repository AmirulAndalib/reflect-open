import { useCallback, useSyncExternalStore } from 'react'

const listenersByKey = new Map<string, Set<() => void>>()

function listenersFor(key: string): Set<() => void> {
  let listeners = listenersByKey.get(key)
  if (listeners === undefined) {
    listeners = new Set()
    listenersByKey.set(key, listeners)
  }
  return listeners
}

function readFlag(key: string, defaultValue: boolean): boolean {
  const stored = window.sessionStorage.getItem(key)
  return stored === null ? defaultValue : stored === 'true'
}

/**
 * A boolean flag persisted in sessionStorage and shared live across every
 * mounted subscriber of the same key: setting it from one component updates
 * all the others immediately. Bare `useState` seeded from storage would
 * desync components mounted side by side — e.g. one backlinks panel per day
 * in the daily stream — until they remount.
 */
export function useSessionFlag(
  key: string,
  defaultValue: boolean,
): [boolean, (next: boolean) => void] {
  const subscribe = useCallback(
    (listener: () => void) => {
      const listeners = listenersFor(key)
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    [key],
  )
  const value = useSyncExternalStore(subscribe, () => readFlag(key, defaultValue))

  const setValue = useCallback(
    (next: boolean) => {
      window.sessionStorage.setItem(key, next ? 'true' : 'false')
      for (const listener of listenersFor(key)) {
        listener()
      }
    },
    [key],
  )

  return [value, setValue]
}

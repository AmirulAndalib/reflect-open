import { useLayoutEffect, useRef } from 'react'
import type { MobileTab } from '@/mobile/mobile-tab-bar'
import type { Route } from '@/routing/route'

const TAB_DOUBLE_TAP_MS = 450

/** The tab whose root screen a route shows, or `null` for stacked screens. */
export function tabRootFor(route: Route): MobileTab | null {
  switch (route.kind) {
    case 'today':
    case 'daily':
      return 'daily'
    case 'allNotes':
    case 'search':
      return 'all'
    case 'tasks':
      return 'tasks'
    case 'chat':
      return 'chat'
    default:
      return null
  }
}

/**
 * The tab bar's capture double-tap: two taps on the same tab within
 * {@link TAB_DOUBLE_TAP_MS} (the Daily tab focuses today's editor, the All
 * tab its search input). A pending tap only pairs while its tab's root stays
 * current — a navigation off the root (a deep link, an opened note) between
 * two taps means the second one is a return, not a capture gesture.
 *
 * @param route The current route, watched to expire stranded taps.
 * @returns Record a tap and report whether it completed a double-tap.
 */
export function useTabDoubleTap(route: Route): (tab: MobileTab) => boolean {
  const lastTap = useRef<{ tab: MobileTab; at: number } | null>(null)

  const currentRoot = tabRootFor(route)
  useLayoutEffect(() => {
    if (lastTap.current !== null && lastTap.current.tab !== currentRoot) {
      lastTap.current = null
    }
  }, [currentRoot])

  return (tab: MobileTab): boolean => {
    const previous = lastTap.current
    const now = Date.now()
    lastTap.current = { tab, at: now }
    return previous !== null && previous.tab === tab && now - previous.at <= TAB_DOUBLE_TAP_MS
  }
}

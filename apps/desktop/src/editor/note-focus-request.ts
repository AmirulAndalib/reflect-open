import { useCallback, useEffect, useRef } from 'react'
import { routesEqual, type Route } from '@/routing/route'
import { useRouter } from '@/routing/router'

/**
 * A one-shot focus request for a note the user is about to arrive on — the
 * mobile focus contract (Plan 19): tapping a `[[wiki link]]` (or a backlink
 * row) blurs the editor, navigates, and restores focus on the destination
 * note's editor. The tap handler records the request just before navigating;
 * the mobile note screen peeks it on mount and passes `autoFocus` down, so
 * the keyboard comes back up on the destination without focusing every
 * arrival (browsing the All list or going back must not raise the keyboard).
 *
 * Desktop never consumes requests — its note route autofocuses every arrival
 * already — so recording in shared navigation code is safe. Requests expire
 * quickly: a stale one (e.g. the navigation never happened) must not focus an
 * unrelated visit later.
 */

const FOCUS_REQUEST_TTL_MS = 3000

interface FocusRequest {
  path: string
  expiresAt: number
}

let pending: FocusRequest | null = null

/** Ask the next mount of `path`'s note screen to focus its editor. */
export function requestNoteFocus(path: string): void {
  pending = { path, expiresAt: Date.now() + FOCUS_REQUEST_TTL_MS }
}

/**
 * True when a live focus request targets `path`. Pure — safe to call during
 * render; pair with {@link clearNoteFocus} once the screen has mounted.
 */
export function peekNoteFocus(path: string): boolean {
  return pending !== null && pending.path === path && Date.now() <= pending.expiresAt
}

/** Drop the request for `path` (idempotent; other paths are untouched). */
export function clearNoteFocus(path: string): void {
  if (pending !== null && pending.path === path) {
    pending = null
  }
}

/**
 * A stable callback that records a focus request for a note route the caller
 * is about to navigate to. Non-note routes are ignored, and so is the
 * **current** route: a same-route navigate doesn't remount the note screen,
 * so nothing would consume the request and it would go stale — free to wrongly
 * focus a plain reopen moments later.
 */
export function useNoteFocusRequester(): (target: Route) => void {
  const { route } = useRouter()
  const routeRef = useRef(route)
  useEffect(() => {
    routeRef.current = route
  })
  return useCallback((target: Route) => {
    if (target.kind === 'note' && !routesEqual(routeRef.current, target)) {
      requestNoteFocus(target.path)
    }
  }, [])
}

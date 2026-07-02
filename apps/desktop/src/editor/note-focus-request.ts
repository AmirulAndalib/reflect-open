/**
 * A one-shot focus request for a note the user is about to arrive on — the
 * mobile focus contract (Plan 19): tapping a `[[wiki link]]` blurs the editor,
 * navigates, and restores focus on the destination note's editor. The tap
 * handler records the request just before navigating; the mobile note screen
 * peeks it on mount and passes `autoFocus` down, so the keyboard comes back up
 * on the destination without focusing every arrival (browsing the All list or
 * going back must not raise the keyboard).
 *
 * Desktop never consumes requests — its note route autofocuses every arrival
 * already — so recording unconditionally in shared navigation code is safe.
 * Requests expire quickly: a stale one (e.g. the navigation never happened)
 * must not focus an unrelated visit later.
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

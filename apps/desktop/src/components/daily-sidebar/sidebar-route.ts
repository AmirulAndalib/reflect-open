import type { Route } from '@/routing/route'

/**
 * The day the daily context sidebar describes for `route`, or `null` when the
 * route gets no daily sidebar: the `today` route follows the live clock, a
 * `daily/:date` route uses its date (real by the router's `normalizeRoute`
 * invariant), and `note`, `search`, and `settings` routes show no daily-only
 * context.
 */
export function dailySidebarDate(route: Route, today: string): string | null {
  switch (route.kind) {
    case 'today':
      return today
    case 'daily':
      return route.date
    case 'note':
    case 'search':
    case 'settings':
      return null
  }
}

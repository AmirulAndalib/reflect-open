/**
 * Typed product routes (Plan 06). These are app states, not page names — the
 * integration point for navigation, back/forward history, and later deep links
 * and CLI `open` (Plan 14).
 *
 * Note identity is the graph-relative path in the first wave (Plan 03), so the
 * note route carries `path` — the reserved frontmatter `id` can join it later
 * without breaking the shape.
 */
export type Route =
  | { kind: 'today' }
  | { kind: 'daily'; date: string }
  | { kind: 'note'; path: string }
  | { kind: 'search'; query: string }

/** Structural route equality (used to avoid pushing no-op history entries). */
export function routesEqual(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) {
    return false
  }
  switch (a.kind) {
    case 'today':
      return true
    case 'daily':
      return a.date === (b as Extract<Route, { kind: 'daily' }>).date
    case 'note':
      return a.path === (b as Extract<Route, { kind: 'note' }>).path
    case 'search':
      return a.query === (b as Extract<Route, { kind: 'search' }>).query
  }
}

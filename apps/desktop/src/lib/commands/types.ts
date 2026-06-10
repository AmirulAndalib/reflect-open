import type { Route } from '@/routing/route'

/**
 * The typed command contract (Plan 08): one registry powers the ⌘K palette,
 * the app-scope keybindings, and — later — deep links and the CLI (Plan 14).
 * Commands receive their capabilities through {@link CommandContext} rather
 * than importing app state, so the registry stays testable and host-agnostic.
 */

export interface CommandContext {
  navigate: (route: Route) => void
  back: () => void
  forward: () => void
  toggleTheme: () => void
  /** The open graph's generation, or null when none (commands no-op then). */
  generation: () => number | null
  /** Open the ⌘K palette (optionally pre-filled). */
  openPalette: (query?: string) => void
}

export interface AppCommand {
  /** Stable id — the deep-link/CLI name (e.g. `nav.today`). */
  id: string
  /** Palette display title. */
  title: string
  /** Extra match terms for palette filtering. */
  keywords?: string[]
  /** Keymap-registry binding (app scope), e.g. `Mod-d`. */
  keybinding?: string
  run: (context: CommandContext) => void | Promise<void>
}

import type { ReactElement } from 'react'
import { Search } from 'lucide-react'
import { ShortcutKeys } from '@/components/shortcut-keys'
import { keybindingFor } from '@/lib/commands/app-commands'

const PALETTE_BINDING = keybindingFor('palette.open')

/**
 * The sidebar's search affordance, styled as the original app's search field —
 * but it's a button: all finding happens in the one ⌘K surface, so this just
 * opens it (and teaches the shortcut with an always-visible keycap).
 */
export function SidebarSearch({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-[7px] border border-border-strong bg-input-bg px-2.5 py-1.5 text-sm text-text-muted shadow-input transition-colors duration-100 hover:text-text-secondary"
    >
      <Search aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">Search anything…</span>
      {PALETTE_BINDING !== null ? <ShortcutKeys binding={PALETTE_BINDING} /> : null}
    </button>
  )
}

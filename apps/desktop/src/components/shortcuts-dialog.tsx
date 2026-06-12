import type { ReactElement } from 'react'
import { ShortcutList } from '@/components/shortcut-list'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { APP_SHORTCUTS, EDITOR_SHORTCUTS } from '@/lib/shortcuts'
import { useShortcuts } from '@/providers/shortcuts-provider'

/**
 * The ⌘/ cheat-sheet (Plan 15): every registered binding from both keymap
 * scopes, in one glanceable dialog. The lists derive from the same registries
 * the bindings fire from, so the sheet can never advertise a dead shortcut.
 */
export function ShortcutsDialog(): ReactElement {
  const { open, closeShortcuts } = useShortcuts()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeShortcuts()
        }
      }}
    >
      {/* No description: the title + lists are the whole content. */}
      <DialogContent aria-describedby={undefined} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          <ShortcutList heading="App" shortcuts={APP_SHORTCUTS} />
          <ShortcutList heading="Editor" shortcuts={EDITOR_SHORTCUTS} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

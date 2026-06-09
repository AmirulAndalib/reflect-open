import { useEffect } from 'react'
import { notePath } from '@reflect/core'
import { ulid } from 'ulidx'
import { registerKeymap } from '@/editor/keymap'
import { useRouter } from './router'

/**
 * App-scope keyboard shortcuts (Plan 06 step 5), registered through the central
 * keymap registry so they can never collide with editor (or future ⌘K, Plan 08)
 * bindings. Editor bindings dispatch through ProseMirror; these are app-level
 * and listen on `window` — the registry is the shared collision ledger.
 */

/** Registered once at module scope; values are display descriptions. */
export const APP_BINDINGS = registerKeymap('app', {
  'Mod-d': 'go to today’s daily note',
  'Mod-n': 'new note',
  'Mod-[': 'back',
  'Mod-]': 'forward',
})

function isModKey(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey
}

/** Install the app-level shortcut listener. Mount once inside the router. */
export function useAppShortcuts(): void {
  const { navigate, back, forward } = useRouter()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isModKey(event) || event.altKey || event.shiftKey || event.repeat) {
        return // held keys must not spam navigations (e.g. a stack of new notes)
      }
      switch (event.key.toLowerCase()) {
        case 'd':
          event.preventDefault()
          navigate({ kind: 'today' })
          break
        case 'n': {
          event.preventDefault()
          // A fresh note path; the file itself is created lazily on the first
          // keystroke (the same contract as daily notes).
          navigate({ kind: 'note', path: notePath(ulid().toLowerCase()) })
          break
        }
        case '[':
          event.preventDefault()
          back()
          break
        case ']':
          event.preventDefault()
          forward()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [navigate, back, forward])
}

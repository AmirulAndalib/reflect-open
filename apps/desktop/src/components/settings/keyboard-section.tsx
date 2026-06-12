import type { ReactElement } from 'react'
import { ShortcutList } from '@/components/shortcut-list'
import { APP_SHORTCUTS, EDITOR_SHORTCUTS } from '@/lib/shortcuts'
import { SettingsSection } from './section'

export function KeyboardSection(): ReactElement {
  return (
    <SettingsSection id="keyboard">
      <ShortcutList heading="App" shortcuts={APP_SHORTCUTS} className="px-4 py-3.5" />
      <ShortcutList heading="Editor" shortcuts={EDITOR_SHORTCUTS} className="px-4 py-3.5" />
    </SettingsSection>
  )
}

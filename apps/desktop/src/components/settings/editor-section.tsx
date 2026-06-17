import type { ReactElement } from 'react'
import type { EditorMarkdownSyntax } from '@reflect/core'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useSettings } from '@/providers/settings-provider'
import { SettingsField } from './field'
import { SettingsOptionCard } from './option-card'
import { SettingsSection } from './section'

interface MarkdownSyntaxOption {
  value: EditorMarkdownSyntax
  label: string
  description: string
}

const MARKDOWN_SYNTAX_OPTIONS: MarkdownSyntaxOption[] = [
  {
    value: 'focus',
    label: 'Focus',
    description: 'Markdown syntax stays hidden and is revealed around your cursor as you edit.',
  },
  {
    value: 'show',
    label: 'Show',
    description: 'Markdown syntax characters are always visible.',
  },
]

export function EditorSection(): ReactElement {
  const { settings, updateSettings } = useSettings()

  return (
    <SettingsSection id="editor">
      <SettingsField
        legend="Markdown syntax"
        description="How literal markdown characters (#, **, [[ ]]) are displayed while editing."
      >
        <div className="mt-3 flex flex-col gap-2">
          {MARKDOWN_SYNTAX_OPTIONS.map((option) => {
            const selected = settings.editorMarkdownSyntax === option.value
            return (
              <SettingsOptionCard
                key={option.value}
                selected={selected}
                className="items-start justify-between gap-3 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      selected && 'text-accent-soft-text',
                    )}
                  >
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {option.description}
                  </span>
                </span>
                <input
                  type="radio"
                  name="editor-markdown-syntax"
                  value={option.value}
                  checked={selected}
                  onChange={() => updateSettings({ editorMarkdownSyntax: option.value })}
                  className="mt-0.5 shrink-0 accent-accent"
                />
              </SettingsOptionCard>
            )
          })}
        </div>
      </SettingsField>

      <SettingsField
        legend="Spell check"
        description="Underline misspelled words while you type."
      >
        <div className="mt-3 flex justify-end">
          <Switch
            aria-label="Spell check"
            checked={settings.editorSpellCheck}
            onCheckedChange={(checked) => updateSettings({ editorSpellCheck: checked })}
          />
        </div>
      </SettingsField>

      <SettingsField
        legend="Start with a bullet"
        description="New and empty notes open with a single bullet point, ready to type."
      >
        <div className="mt-3 flex justify-end">
          <Switch
            aria-label="Start with a bullet"
            checked={settings.editorDefaultBullet}
            onCheckedChange={(checked) => updateSettings({ editorDefaultBullet: checked })}
          />
        </div>
      </SettingsField>

      <SettingsField
        legend="Bullet after a heading"
        description="Pressing Return at the end of a heading starts a new bullet."
      >
        <div className="mt-3 flex justify-end">
          <Switch
            aria-label="Bullet after a heading"
            checked={settings.editorBulletAfterHeading}
            onCheckedChange={(checked) => updateSettings({ editorBulletAfterHeading: checked })}
          />
        </div>
      </SettingsField>
    </SettingsSection>
  )
}

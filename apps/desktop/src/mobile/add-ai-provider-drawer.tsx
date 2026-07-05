import { useState, type ReactElement } from 'react'
import { AI_PROVIDERS, aiProvider, type AiProviderId } from '@reflect/core'
import { InlineAlert } from '@/components/inline-alert'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { useAddAiProviderSubmit } from '@/hooks/use-add-ai-provider-submit'
import type { NewAiProvider } from '@/hooks/use-ai-providers'
import { SettingsGroup, SettingsSelectRow, SettingsSwitchRow } from '@/mobile/settings-list'

interface AddAiProviderDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Persists the new provider (keychain + settings); rejects on failure. */
  onAdd: (draft: NewAiProvider) => Promise<void>
}

/**
 * The mobile "Add AI provider" bottom sheet — desktop's dialog in the
 * inset-grouped idiom over the same {@link useAddAiProviderSubmit} flow
 * (verify key → inline rejection / save-anyway downgrade → persist).
 * Models come from the provider's curated list; custom model ids stay a
 * desktop affordance. The sheet body mounts per open cycle, so a dismissed
 * half-typed key never leaks into the next open.
 */
export function AddAiProviderDrawer({
  open,
  onOpenChange,
  onAdd,
}: AddAiProviderDrawerProps): ReactElement {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-label="Add AI provider">
        {open ? <AddAiProviderSheet onAdd={onAdd} onClose={() => onOpenChange(false)} /> : null}
      </DrawerContent>
    </Drawer>
  )
}

/** The sheet body — separate so each open starts a fresh draft. */
function AddAiProviderSheet({
  onAdd,
  onClose,
}: {
  onAdd: (draft: NewAiProvider) => Promise<void>
  onClose: () => void
}): ReactElement {
  const [providerId, setProviderId] = useState<AiProviderId>(AI_PROVIDERS[0].id)
  const [model, setModel] = useState(AI_PROVIDERS[0].models[0].id)
  const [apiKey, setApiKey] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { submitError, unverified, resetUnverified, submit } = useAddAiProviderSubmit({
    onAdd,
    onDone: onClose,
  })
  const provider = aiProvider(providerId)

  const submitDraft = async (): Promise<void> => {
    setSubmitting(true)
    try {
      await submit({ provider: providerId, model, apiKey, isDefault })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DrawerTitle className="px-4 pt-1">Add AI provider</DrawerTitle>
      <div className="flex max-h-[75dvh] flex-col gap-6 overflow-y-auto px-4 pb-8 pt-4">
        <p className="text-sm text-text-muted">
          The API key is stored in this device’s keychain, never in your graph — add it on each
          device you chat from.
        </p>
        <SettingsGroup header="Provider">
          {AI_PROVIDERS.map((candidate) => (
            <SettingsSelectRow
              key={candidate.id}
              label={candidate.label}
              selected={candidate.id === providerId}
              onPress={() => {
                setProviderId(candidate.id)
                setModel(candidate.models[0].id)
                resetUnverified()
              }}
            />
          ))}
        </SettingsGroup>
        <SettingsGroup header="Default model">
          {provider.models.map((candidate) => (
            <SettingsSelectRow
              key={candidate.id}
              label={candidate.label}
              selected={candidate.id === model}
              onPress={() => setModel(candidate.id)}
            />
          ))}
        </SettingsGroup>
        <SettingsGroup header="API key">
          <div className="px-4 py-2">
            <Input
              type="password"
              placeholder={provider.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              aria-label="API key"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value)
                resetUnverified()
              }}
            />
          </div>
          <SettingsSwitchRow
            label="Use as the default provider"
            checked={isDefault}
            onCheckedChange={setIsDefault}
          />
        </SettingsGroup>
        {submitError !== null ? <InlineAlert tone="error">{submitError}</InlineAlert> : null}
        {unverified ? (
          <InlineAlert tone="warning">
            Couldn’t reach {provider.label} to verify the key. Submit again to save it unverified.
          </InlineAlert>
        ) : null}
        <Button
          disabled={apiKey.trim() === '' || submitting}
          onClick={() => void submitDraft()}
        >
          {unverified ? 'Save anyway' : 'Add provider'}
        </Button>
      </div>
    </>
  )
}

import { useCallback } from 'react'
import {
  aiKeySecretName,
  apiKeyHint,
  deleteSecret,
  setSecret,
  withAiModelAdded,
  withAiModelRemoved,
  withDefaultAiModel,
  type AiModelConfig,
  type AiProviderId,
} from '@reflect/core'
import { useSettings } from '@/providers/settings-provider'

/**
 * The configured-AI-models surface (Plan 10): one hook owning the pairing of
 * the settings document (provider, model, key hint, default flag) with the OS
 * keychain (the key itself). Components never touch the secret commands
 * directly, so the "settings entry ⇄ keychain entry" invariant has one owner.
 */

/** What the add-model dialog collects; the key goes to the keychain only. */
export interface NewAiModel {
  provider: AiProviderId
  model: string
  apiKey: string
  isDefault: boolean
}

interface UseAiModelsValue {
  models: AiModelConfig[]
  /**
   * Store the key in the keychain, then add the settings entry. Rejects (and
   * adds nothing) if the keychain write fails, so an entry can never point at
   * a key that was never stored.
   */
  addModel: (draft: NewAiModel) => Promise<void>
  /** Delete the key from the keychain, then drop the settings entry. */
  removeModel: (id: string) => Promise<void>
  /** Make the entry with `id` the app-wide default. */
  makeDefault: (id: string) => void
}

export function useAiModels(): UseAiModelsValue {
  const { settings, updateSettings } = useSettings()
  const models = settings.aiModels

  const addModel = useCallback(
    async (draft: NewAiModel): Promise<void> => {
      const id = crypto.randomUUID()
      await setSecret(aiKeySecretName(id), draft.apiKey)
      updateSettings({
        aiModels: withAiModelAdded(models, {
          id,
          provider: draft.provider,
          model: draft.model,
          keyHint: apiKeyHint(draft.apiKey),
          isDefault: draft.isDefault,
        }),
      })
    },
    [models, updateSettings],
  )

  const removeModel = useCallback(
    async (id: string): Promise<void> => {
      await deleteSecret(aiKeySecretName(id))
      updateSettings({ aiModels: withAiModelRemoved(models, id) })
    },
    [models, updateSettings],
  )

  const makeDefault = useCallback(
    (id: string): void => {
      updateSettings({ aiModels: withDefaultAiModel(models, id) })
    },
    [models, updateSettings],
  )

  return { models, addModel, removeModel, makeDefault }
}

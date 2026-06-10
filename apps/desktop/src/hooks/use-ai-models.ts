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
  const { settings, updateSettingsWith } = useSettings()
  const models = settings.aiModels

  // Every write goes through `updateSettingsWith` so the list is rebuilt from
  // the settings as they are when the update applies — not from this render's
  // snapshot. The keychain awaits make these genuinely concurrent: a second
  // add/remove can land mid-flight, and a snapshot-based write would clobber
  // it (or resurrect an entry whose key was already deleted).

  const addModel = useCallback(
    async (draft: NewAiModel): Promise<void> => {
      const id = crypto.randomUUID()
      await setSecret(aiKeySecretName(id), draft.apiKey)
      updateSettingsWith((current) => ({
        aiModels: withAiModelAdded(current.aiModels, {
          id,
          provider: draft.provider,
          model: draft.model,
          keyHint: apiKeyHint(draft.apiKey),
          isDefault: draft.isDefault,
        }),
      }))
    },
    [updateSettingsWith],
  )

  const removeModel = useCallback(
    async (id: string): Promise<void> => {
      // Keychain first, deliberately. The two stores can't be updated
      // transactionally; interrupted in this order, the leftover is a
      // visibly dead settings row the user can remove again. The reverse
      // order would strand the credential invisibly in the keychain — the
      // keyring API can't enumerate entries, so it could never be swept.
      // The settings write itself is retried by the provider on failure.
      await deleteSecret(aiKeySecretName(id))
      updateSettingsWith((current) => ({ aiModels: withAiModelRemoved(current.aiModels, id) }))
    },
    [updateSettingsWith],
  )

  const makeDefault = useCallback(
    (id: string): void => {
      updateSettingsWith((current) => ({ aiModels: withDefaultAiModel(current.aiModels, id) }))
    },
    [updateSettingsWith],
  )

  return { models, addModel, removeModel, makeDefault }
}

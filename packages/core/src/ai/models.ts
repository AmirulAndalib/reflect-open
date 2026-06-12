import type { AiModelConfig } from '../settings/schema'

/**
 * Pure transforms over the configured-AI-models state (Plan 10). The default
 * is a single id (`defaultAiModelId` in the settings document), so "at most
 * one default" holds by construction; a dangling id resolves through
 * {@link defaultAiModel}'s first-entry fallback. Callers pair these with the
 * keychain bindings in `secrets.ts` — the state never carries the keys
 * themselves.
 */

/** The two settings-document keys these transforms operate on, together. */
export interface AiModelsState {
  models: AiModelConfig[]
  defaultModelId: string | null
}

/** How many trailing key characters are kept as the display hint. */
export const KEY_HINT_LENGTH = 5

/**
 * The display-only suffix of an API key (`keyHint` in the settings doc).
 * Empty for keys shorter than twice the hint — a hint must never reveal
 * most of the key it identifies.
 */
export function apiKeyHint(key: string): string {
  return key.length >= KEY_HINT_LENGTH * 2 ? key.slice(-KEY_HINT_LENGTH) : ''
}

/**
 * Append `entry`; it becomes the default when requested or when it is the
 * first entry.
 */
export function withAiModelAdded(
  state: AiModelsState,
  entry: AiModelConfig,
  makeDefault: boolean,
): AiModelsState {
  return {
    models: [...state.models, entry],
    defaultModelId:
      makeDefault || state.models.length === 0 ? entry.id : state.defaultModelId,
  }
}

/**
 * Remove the entry with `id`. If it was the default, the first remaining
 * entry takes over (`null` when the list empties).
 */
export function withAiModelRemoved(state: AiModelsState, id: string): AiModelsState {
  const models = state.models.filter((model) => model.id !== id)
  return {
    models,
    defaultModelId:
      state.defaultModelId === id ? (models[0]?.id ?? null) : state.defaultModelId,
  }
}

/**
 * The entry AI features should use when no explicit choice is made: the one
 * `defaultModelId` points at, falling back to the first entry when the id is
 * null or dangling.
 */
export function defaultAiModel(state: AiModelsState): AiModelConfig | null {
  return (
    state.models.find((model) => model.id === state.defaultModelId) ?? state.models[0] ?? null
  )
}

/**
 * Providers with a speech-to-text path, in preference order (Anthropic has
 * no audio API).
 */
export const TRANSCRIPTION_PROVIDERS = ['openai', 'google'] as const

export type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number]

/** A configured entry known to belong to a transcription-capable provider. */
export type TranscriptionConfig = AiModelConfig & { provider: TranscriptionProvider }

/**
 * The configured entry audio transcription should run on: any OpenAI entry
 * wins over any Google entry, and within a provider the app default wins over
 * the first. `null` means no capable provider is configured — the feature is
 * unavailable. The entry only addresses the provider + API key; the
 * transcription model itself is fixed per provider (see `transcribe.ts`), so
 * the entry's chat-model choice never transfers.
 */
export function pickTranscriptionConfig(state: AiModelsState): TranscriptionConfig | null {
  for (const provider of TRANSCRIPTION_PROVIDERS) {
    const candidates = state.models.filter(
      (model): model is TranscriptionConfig => model.provider === provider,
    )
    if (candidates.length > 0) {
      return candidates.find((model) => model.id === state.defaultModelId) ?? candidates[0]
    }
  }
  return null
}

import type { AiModelConfig } from '../settings/schema'

/**
 * Pure transforms over the configured-AI-models list (Plan 10). They maintain
 * one invariant: a non-empty list has exactly one default entry. Callers pair
 * these with the keychain bindings in `secrets.ts` — the list never carries
 * the keys themselves.
 */

/** How many trailing key characters are kept as the display hint. */
export const KEY_HINT_LENGTH = 5

/** The display-only suffix of an API key (`keyHint` in the settings doc). */
export function apiKeyHint(key: string): string {
  return key.slice(-KEY_HINT_LENGTH)
}

/**
 * Append `entry`, keeping a single default: the first entry is always the
 * default, and an entry added as default demotes the previous one.
 */
export function withAiModelAdded(models: AiModelConfig[], entry: AiModelConfig): AiModelConfig[] {
  const isDefault = entry.isDefault || models.length === 0
  const existing = isDefault
    ? models.map((model) => ({ ...model, isDefault: false }))
    : [...models]
  return [...existing, { ...entry, isDefault }]
}

/**
 * Remove the entry with `id`. If it was the default, the first remaining
 * entry is promoted so the list never ends up default-less.
 */
export function withAiModelRemoved(models: AiModelConfig[], id: string): AiModelConfig[] {
  const remaining = models.filter((model) => model.id !== id)
  if (remaining.length === 0 || remaining.some((model) => model.isDefault)) {
    return remaining
  }
  return remaining.map((model, index) => (index === 0 ? { ...model, isDefault: true } : model))
}

/** Make the entry with `id` the sole default. */
export function withDefaultAiModel(models: AiModelConfig[], id: string): AiModelConfig[] {
  return models.map((model) => ({ ...model, isDefault: model.id === id }))
}

/** The entry AI features should use when no explicit choice is made. */
export function defaultAiModel(models: AiModelConfig[]): AiModelConfig | null {
  return models.find((model) => model.isDefault) ?? models[0] ?? null
}

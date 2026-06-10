import { z } from 'zod'

/**
 * The user-settings schema — the policy half of the settings store. Rust
 * persists an opaque JSON object in the OS config dir; this schema owns the
 * known keys, their defaults, and their validation.
 *
 * Resilience contract (mirrors the frontmatter schema): a missing or invalid
 * value degrades to its default (`.catch`) instead of failing the whole load,
 * and unknown keys are preserved (`.passthrough`) so a document written by a
 * newer app version round-trips through an older one without losing fields.
 */

/**
 * How the editor renders markdown syntax characters. `focus` (the default)
 * hides them except near the caret; `show` always displays them.
 *
 * The persisted name is implementation-neutral on purpose — it maps to
 * meowdown's "mark mode" at the editor boundary, but the settings document
 * must outlive any one editor library.
 */
export const editorMarkdownSyntaxSchema = z.enum(['focus', 'show']).catch('focus')

export type EditorMarkdownSyntax = z.infer<typeof editorMarkdownSyntaxSchema>

/**
 * The app color theme. `system` (the default) follows the OS preference;
 * `light`/`dark` pin it. Persisted here so the choice survives relaunch.
 */
export const themePreferenceSchema = z.enum(['system', 'light', 'dark']).catch('system')

export type ThemePreference = z.infer<typeof themePreferenceSchema>

/**
 * The cloud AI providers Reflect can call directly (BYOK — the user's own
 * keys, no Reflect-hosted proxy).
 */
export const aiProviderIdSchema = z.enum(['openai', 'anthropic', 'google'])

export type AiProviderId = z.infer<typeof aiProviderIdSchema>

/**
 * One configured AI model: a provider, the chosen model id, and whether it is
 * the app-wide default. The API key itself lives in the OS keychain (addressed
 * by `id` — see `aiKeySecretName`) and **never** in this document; `keyHint`
 * keeps only the key's trailing characters so the settings UI can identify it.
 */
export const aiModelConfigSchema = z.object({
  id: z.string().min(1),
  provider: aiProviderIdSchema,
  model: z.string().min(1),
  keyHint: z.string().catch(''),
  isDefault: z.boolean().catch(false),
})

export type AiModelConfig = z.infer<typeof aiModelConfigSchema>

/**
 * The configured AI models. Resilience is per entry, not per list: a corrupt
 * entry is dropped while the rest load, so one bad hand-edit can't wipe every
 * configured provider. A non-array value degrades to the empty list.
 */
export const aiModelsSchema = z
  .array(z.unknown())
  .catch([])
  .transform((entries) =>
    entries.flatMap((entry) => {
      const parsed = aiModelConfigSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    }),
  )

export const settingsSchema = z
  .object({
    editorMarkdownSyntax: editorMarkdownSyntaxSchema,
    theme: themePreferenceSchema,
    aiModels: aiModelsSchema,
  })
  .passthrough()

export type Settings = z.infer<typeof settingsSchema>

/** The settings a fresh install starts from (every key at its default). */
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({})

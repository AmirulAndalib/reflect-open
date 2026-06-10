import { z } from 'zod'
import { call } from '../ipc/invoke'

/**
 * Typed bindings for the OS-keychain commands (Plan 10). BYOK API keys go
 * through here and **only** here — never into markdown, Git, `.reflect/`, or
 * the settings document.
 */

/** Commands that return `()` from Rust serialize as `null` over IPC. */
const voidSchema = z.null()

const secretSchema = z.string().nullable()

/**
 * The keychain account name holding the API key for a configured AI model
 * (`AiModelConfig.id` is the stable half of the address).
 */
export function aiKeySecretName(configId: string): string {
  return `ai-api-key:${configId}`
}

/** Store `value` in the OS keychain under `name`, replacing any prior value. */
export async function setSecret(name: string, value: string): Promise<void> {
  await call('secret_set', { name, value }, voidSchema)
}

/** Read the secret stored under `name`, or `null` when none exists. */
export async function getSecret(name: string): Promise<string | null> {
  return call('secret_get', { name }, secretSchema)
}

/** Remove the secret stored under `name` (a missing entry is not an error). */
export async function deleteSecret(name: string): Promise<void> {
  await call('secret_delete', { name }, voidSchema)
}

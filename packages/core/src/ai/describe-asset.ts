import { APICallError, generateText, type UserContent } from 'ai'
import { ReflectError } from '../errors'
import type { AiProviderConfig } from '../settings/schema'
import { languageModel } from './language-model'

/**
 * BYOK asset description/OCR: one local asset in, markdown text out. Images are
 * sent as image parts, PDFs as file parts; callers own privacy gating before
 * this function is reached.
 */

const DESCRIBE_ASSET_TIMEOUT_MS = 120_000

export interface DescribeAssetRequest {
  /** The provider entry to call (the app default). */
  config: AiProviderConfig
  /** The BYOK API key, read from the OS keychain by the caller. */
  apiKey: string
  /** Host transport (the Tauri HTTP plugin's fetch; tests pass a stub). */
  fetchFn?: typeof fetch | undefined
  /** Graph-relative asset path, used for filename/context only. */
  path: string
  /** Base64-encoded asset bytes, without a data URL prefix. */
  contentsBase64: string
  /** IANA media type for the asset. */
  mediaType: string
  /** Abort the provider call (graph switch / manual cancellation). */
  signal?: AbortSignal | undefined
}

/**
 * The provider refused this asset itself (unsupported file, too large, etc.).
 * The caller logs and moves on; v1 intentionally does not write failure
 * tombstones.
 */
export class AssetDescriptionRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssetDescriptionRejectedError'
  }
}

/** Type guard for {@link AssetDescriptionRejectedError}. */
export function isAssetDescriptionRejected(
  value: unknown,
): value is AssetDescriptionRejectedError {
  return value instanceof AssetDescriptionRejectedError
}

function classify(cause: unknown): Error {
  if (APICallError.isInstance(cause)) {
    const status = cause.statusCode ?? 0
    if (status === 401 || status === 403) {
      return new ReflectError('auth', `the provider rejected the API key (${status})`)
    }
    if (status === 429 || status >= 500) {
      return new ReflectError('network', `the provider is unavailable (${status})`)
    }
    if (status >= 400) {
      return new AssetDescriptionRejectedError(cause.message)
    }
  }
  if (cause instanceof DOMException && cause.name === 'TimeoutError') {
    return new ReflectError('network', 'the asset description request timed out')
  }
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return new ReflectError('network', 'the asset description request was cancelled')
  }
  return cause instanceof Error ? cause : new Error(String(cause))
}

function prompt(path: string): string {
  return [
    'Describe this Reflect asset for a local markdown sidecar.',
    `Asset path: ${path}`,
    'Return markdown only.',
    'Include a concise description of the visual or document contents.',
    'If readable text is visible, include an OCR / extracted text section.',
    'Do not invent text that is not present.',
  ].join('\n')
}

function filename(path: string): string {
  return path.split('/').at(-1) ?? 'asset'
}

/**
 * Generate a markdown description/OCR sidecar body for one asset. Throws
 * {@link ReflectError} (`auth`, `network`) for retryable pass-stopping
 * failures and {@link AssetDescriptionRejectedError} for permanent refusals.
 */
export async function describeAsset(request: DescribeAssetRequest): Promise<string> {
  const content: UserContent = [{ type: 'text', text: prompt(request.path) }]
  if (request.mediaType === 'application/pdf') {
    content.push({
      type: 'file',
      data: request.contentsBase64,
      filename: filename(request.path),
      mediaType: request.mediaType,
    })
  } else {
    content.push({
      type: 'image',
      image: request.contentsBase64,
      mediaType: request.mediaType,
    })
  }

  const timeout = AbortSignal.timeout(DESCRIBE_ASSET_TIMEOUT_MS)
  const signal =
    request.signal === undefined
      ? timeout
      : AbortSignal.any([request.signal, timeout])

  try {
    const result = await generateText({
      model: languageModel(request.config, request.apiKey, request.fetchFn ?? fetch),
      messages: [{ role: 'user', content }],
      abortSignal: signal,
      maxRetries: 0,
    })
    return result.text.trim()
  } catch (cause) {
    throw classify(cause)
  }
}

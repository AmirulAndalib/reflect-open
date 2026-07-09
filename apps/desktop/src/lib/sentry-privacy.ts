import type { init } from '@sentry/react'

type SentryInitOptions = NonNullable<Parameters<typeof init>[0]>
type BeforeSend = NonNullable<SentryInitOptions['beforeSend']>
type SentryErrorEvent = Parameters<BeforeSend>[0]
type SentryException = NonNullable<NonNullable<SentryErrorEvent['exception']>['values']>[number]
type SentryFrame = NonNullable<NonNullable<SentryException['stacktrace']>['frames']>[number]
type SentryDebugImage = NonNullable<NonNullable<SentryErrorEvent['debug_meta']>['images']>[number]

const LOCAL_PATH_PATTERNS = [
  /^file:\/\//i,
  /^\/(?:Users|home|private|var|tmp)\//i,
  /^[A-Z]:[\\/]/i,
  /[\\/]Reflect[\\/]/,
  /[\\.]reflect[\\/]/,
]

const APP_ASSET_PATH_PATTERNS = [
  /^app:\/\/\/assets\//i,
  /^tauri:\/\/[^/]*\/assets\//i,
  /^https?:\/\/(?:localhost|127\.0\.0\.1|tauri\.localhost)(?::\d+)?\/assets\//i,
  /^\/?assets\//i,
]

const LOCAL_ASSET_PATTERN = /(?:^|[\\/])assets[\\/](?<assetPath>[^?#]+)$/i

/** Sentry beforeBreadcrumb hook that drops all breadcrumbs before note text can enter an event. */
export const dropSentryBreadcrumb: NonNullable<SentryInitOptions['beforeBreadcrumb']> = () => null

/**
 * Sentry beforeSend hook that removes free-form event fields before an error leaves the app.
 *
 * This keeps release/environment metadata and sanitized stack-frame structure, while stripping
 * messages, breadcrumbs, request data, user data, custom contexts, tags, transaction names,
 * exception type/value/mechanism text, frame source snippets, frame locals, and local filesystem
 * paths.
 */
export function scrubSentryEventForPrivacy(event: SentryErrorEvent): SentryErrorEvent {
  const scrubbed: SentryErrorEvent = { ...event }

  delete scrubbed.message
  delete scrubbed.logentry
  delete scrubbed.request
  delete scrubbed.breadcrumbs
  delete scrubbed.extra
  delete scrubbed.user
  delete scrubbed.transaction
  delete scrubbed.tags
  delete scrubbed.fingerprint
  delete scrubbed.server_name
  delete scrubbed.spans
  delete scrubbed.measurements
  delete scrubbed.threads
  delete scrubbed.contexts
  delete scrubbed.sdkProcessingMetadata

  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      values: scrubbed.exception.values.map(scrubException),
    }
  }

  if (scrubbed.debug_meta?.images) {
    const images = scrubbed.debug_meta.images.map(scrubDebugImage).filter(isSentryDebugImage)
    if (images.length > 0) {
      scrubbed.debug_meta = { ...scrubbed.debug_meta, images }
    } else {
      delete scrubbed.debug_meta
    }
  }

  return scrubbed
}

function scrubException(exception: SentryException): SentryException {
  const scrubbed = { ...exception }
  delete scrubbed.type
  delete scrubbed.value
  delete scrubbed.mechanism
  delete scrubbed.module
  if (scrubbed.stacktrace?.frames) {
    scrubbed.stacktrace = {
      ...scrubbed.stacktrace,
      frames: scrubbed.stacktrace.frames.map(scrubStackFrame),
    }
  }
  return scrubbed
}

function scrubDebugImage(image: SentryDebugImage): SentryDebugImage | undefined {
  if (!('code_file' in image) || !image.code_file) {
    return image
  }

  const codeFile = normalizeStackFramePath(image.code_file)
  return codeFile ? { ...image, code_file: codeFile } : undefined
}

function isSentryDebugImage(image: SentryDebugImage | undefined): image is SentryDebugImage {
  return image !== undefined
}

function scrubStackFrame(frame: SentryFrame): SentryFrame {
  const scrubbed = { ...frame }
  applyNormalizedStackFramePath(scrubbed, 'filename')
  applyNormalizedStackFramePath(scrubbed, 'abs_path')
  delete scrubbed.module
  delete scrubbed.context_line
  delete scrubbed.pre_context
  delete scrubbed.post_context
  delete scrubbed.vars
  delete scrubbed.module_metadata
  return scrubbed
}

function applyNormalizedStackFramePath(frame: SentryFrame, field: 'filename' | 'abs_path'): void {
  const normalizedPath = normalizeStackFramePath(frame[field])
  if (normalizedPath) {
    frame[field] = normalizedPath
    return
  }

  delete frame[field]
}

function normalizeStackFramePath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined
  }

  const strippedPath = stripQueryAndHash(path)
  if (APP_ASSET_PATH_PATTERNS.some((pattern) => pattern.test(strippedPath))) {
    return strippedPath
  }

  if (LOCAL_PATH_PATTERNS.some((pattern) => pattern.test(strippedPath))) {
    const assetPath = LOCAL_ASSET_PATTERN.exec(strippedPath)?.groups?.['assetPath']
    return assetPath ? `app:///assets/${assetPath.replaceAll('\\', '/')}` : undefined
  }

  return undefined
}

function stripQueryAndHash(path: string): string {
  const queryIndex = path.search(/[?#]/)
  return queryIndex === -1 ? path : path.slice(0, queryIndex)
}

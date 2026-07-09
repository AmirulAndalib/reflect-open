import type { init } from '@sentry/react'

type SentryInitOptions = NonNullable<Parameters<typeof init>[0]>
type BeforeSend = NonNullable<SentryInitOptions['beforeSend']>
type SentryErrorEvent = Parameters<BeforeSend>[0]
type SentryException = NonNullable<NonNullable<SentryErrorEvent['exception']>['values']>[number]

export const dropSentryBreadcrumb: NonNullable<SentryInitOptions['beforeBreadcrumb']> = () => null

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

  return scrubbed
}

function scrubException(exception: SentryException): SentryException {
  const scrubbed = { ...exception }
  delete scrubbed.value
  if (scrubbed.stacktrace?.frames) {
    scrubbed.stacktrace = {
      ...scrubbed.stacktrace,
      frames: scrubbed.stacktrace.frames.map((frame) => {
        const scrubbedFrame = { ...frame }
        delete scrubbedFrame.context_line
        delete scrubbedFrame.pre_context
        delete scrubbedFrame.post_context
        delete scrubbedFrame.vars
        delete scrubbedFrame.module_metadata
        return scrubbedFrame
      }),
    }
  }
  return scrubbed
}

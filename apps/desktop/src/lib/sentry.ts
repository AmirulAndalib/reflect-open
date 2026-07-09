import { init } from '@sentry/react'
import { dropSentryBreadcrumb, scrubSentryEventForPrivacy } from '@/lib/sentry-privacy'

const DEFAULT_DSN =
  'https://91e35d9c7b2d0a1898bc9574c6a6f3f2@o463484.ingest.us.sentry.io/4511705649971200'

const dsn =
  import.meta.env.VITE_SENTRY_DSN ||
  (import.meta.env.VITE_SENTRY_ENABLED === 'true' ? DEFAULT_DSN : '')

const enabled = dsn.length > 0 && import.meta.env.VITE_SENTRY_ENABLED !== 'false'

init({
  dsn,
  enabled,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
  debug: import.meta.env.DEV && import.meta.env.VITE_SENTRY_DEBUG === 'true',
  maxBreadcrumbs: 0,
  enableLogs: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    queryParams: false,
    genAI: { inputs: false, outputs: false },
    stackFrameVariables: false,
    frameContextLines: 0,
  },
  beforeBreadcrumb: dropSentryBreadcrumb,
  beforeSend: scrubSentryEventForPrivacy,
  beforeSendLog: () => null,
  beforeSendTransaction: () => null,
})

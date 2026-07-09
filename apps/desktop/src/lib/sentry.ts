import { init } from '@sentry/react'

const DEFAULT_DSN =
  'https://91e35d9c7b2d0a1898bc9574c6a6f3f2@o463484.ingest.us.sentry.io/4511705649971200'

const enabled =
  import.meta.env.VITE_SENTRY_ENABLED === 'true' ||
  (import.meta.env.PROD && import.meta.env.VITE_SENTRY_ENABLED !== 'false')

init({
  dsn: import.meta.env.VITE_SENTRY_DSN || DEFAULT_DSN,
  enabled,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
  debug: import.meta.env.DEV && import.meta.env.VITE_SENTRY_DEBUG === 'true',
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    queryParams: false,
    genAI: { inputs: false, outputs: false },
  },
})

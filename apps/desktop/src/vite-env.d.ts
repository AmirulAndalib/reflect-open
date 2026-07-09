/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DEBUG?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENABLED?: string
  readonly VITE_SENTRY_RELEASE?: string

  /**
   * Build-target platform injected by the Tauri CLI (`darwin`, `windows`,
   * `linux`, `ios`, `android`). Absent in plain Vite builds and tests.
   */
  readonly TAURI_ENV_PLATFORM?: string
}

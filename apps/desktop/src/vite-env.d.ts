/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Build-target platform injected by the Tauri CLI (`darwin`, `windows`,
   * `linux`, `ios`, `android`). Absent in plain Vite builds and tests.
   */
  readonly TAURI_ENV_PLATFORM?: string
}

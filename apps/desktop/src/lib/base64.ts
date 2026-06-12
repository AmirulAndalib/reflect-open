/** Base64-encode raw bytes (asset writes over JSON IPC, inline image payloads). */
export function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // Encode in 32 KiB chunks: spreading the whole buffer into String.fromCharCode
  // would exceed the engine's argument-count limit on large images.
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

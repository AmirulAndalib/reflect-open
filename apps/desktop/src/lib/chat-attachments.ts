import { base64Of } from '@/lib/base64'

/**
 * Image attachments for the chat composer. A dropped or pasted photo is read
 * once into a {@link ChatAttachment} whose `data:` URL serves double duty —
 * it is the `<img src>` for the composer preview and the transcript bubble,
 * and the image payload the AI SDK sends to the provider.
 */

/** One image the user attached to a chat turn. */
export interface ChatAttachment {
  id: string
  /** Original filename — the preview's alt text and accessible labels. */
  name: string
  /** IANA media type, e.g. `image/png`. */
  mediaType: string
  /** The image bytes as a `data:` URL — rendered as-is and sent to the provider. */
  dataUrl: string
}

/** The image files in a drop or paste payload; everything else is ignored. */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) {
    return []
  }
  return Array.from(data.files).filter((file) => file.type.startsWith('image/'))
}

/** Read an image file into an attachment, bytes inlined as a `data:` URL. */
export async function toChatAttachment(file: File): Promise<ChatAttachment> {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mediaType: file.type,
    dataUrl: `data:${file.type};base64,${base64Of(await file.arrayBuffer())}`,
  }
}

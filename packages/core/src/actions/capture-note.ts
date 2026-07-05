import { z } from 'zod'
import { isAppError } from '../errors'
import { readNote } from '../graph/commands'
import { hashContent } from '../indexing/hash'
import { wikiLinkSafe } from '../markdown/edit'
import { parseFrontmatter, splitFrontmatter, upsertFrontmatter } from '../markdown/frontmatter'
import type { Frontmatter } from '../markdown/model'
import type { CaptureIdentity } from './capture-identity'
import type { CaptureEnvelope } from './capture-envelope'

/** Enrichment lifecycle of a capture note, in its frontmatter. */
export type CaptureStatus = 'pending' | 'done' | 'skipped'

const captureNoteMetaSchema = z.object({
  captureUrl: z.string(),
  captureStatus: z.enum(['pending', 'done', 'skipped']),
  captureHash: z.string(),
  captureSelectionHash: z.string().optional(),
  captureScreenshot: z.string().optional(),
})

export type CaptureNoteMeta = z.infer<typeof captureNoteMetaSchema>

/** The capture keys from a parsed frontmatter, or `null` when absent/mangled. */
export function captureNoteMeta(frontmatter: Frontmatter): CaptureNoteMeta | null {
  const parsed = captureNoteMetaSchema.safeParse(frontmatter)
  return parsed.success ? parsed.data : null
}

function urlHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const PAGE_TEXT_START = '<!-- reflect-capture-page-text:start -->'
const PAGE_TEXT_END = '<!-- reflect-capture-page-text:end -->'

/** The capture's display title: the page title, else the URL's host. */
export function displayTitle(envelope: CaptureEnvelope): string {
  const title = wikiLinkSafe(envelope.title)
  return title !== '' ? title : urlHost(envelope.url)
}

function captureNoteBody(
  envelope: CaptureEnvelope,
  identity: CaptureIdentity,
  hasScreenshot: boolean,
): string {
  const title = displayTitle(envelope)
  const metadata = [`- URL: ${envelope.url}`, '- Type: #link']
  const metaDescription = envelope.metaDescription?.trim()
  if (metaDescription) {
    metadata.push(`- Description: ${metadataValue(metaDescription)}`)
  }
  const parts = [`# ${title}`, metadata.join('\n')]
  const note = envelope.note?.trim()
  if (note) {
    parts.push(`## Note\n\n${note}`)
  }
  const selection = envelope.selection?.trim()
  if (selection) {
    parts.push(`## Selection\n\n${selection}`)
  }
  const contentText = envelope.contentText?.trim()
  if (contentText) {
    parts.push(`## Page Text\n\n${PAGE_TEXT_START}\n${contentText}\n${PAGE_TEXT_END}`)
  }
  if (hasScreenshot) {
    parts.push(`## Screenshot\n\n![${title}](${identity.assetPath})`)
  }
  return `${parts.join('\n\n')}\n`
}

export function capturePageTextFromBody(body: string): string | undefined {
  const marker = `\n## Page Text\n\n${PAGE_TEXT_START}\n`
  const markerAt = body.indexOf(marker)
  if (markerAt === -1) {
    return undefined
  }
  const contentStart = markerAt + marker.length
  const endAt = body.indexOf(PAGE_TEXT_END, contentStart)
  if (endAt === -1) {
    throw new Error('capture note is missing page text end marker')
  }
  const content = body.slice(contentStart, endAt).trim()
  return content === '' ? undefined : content
}

function firstSectionStart(body: string): number {
  let offset = 0
  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) {
      return offset
    }
    offset += line.length + 1
  }
  return body.length
}

export async function captureNoteSource(
  envelope: CaptureEnvelope,
  identity: CaptureIdentity,
  options: { hasScreenshot: boolean; status: CaptureStatus; selectionHash?: string | undefined },
): Promise<string> {
  const body = captureNoteBody(envelope, identity, options.hasScreenshot)
  return upsertFrontmatter(body, {
    aliases: [identity.base],
    captureUrl: envelope.url,
    capturedAt: envelope.capturedAt,
    captureSource: envelope.source,
    captureStatus: options.status,
    captureHash: await hashContent(body),
    captureSelectionHash: options.selectionHash,
    captureScreenshot: options.hasScreenshot ? identity.assetPath : undefined,
  })
}

/** A note's source at `generation`, where "no note yet" reads as empty. */
export async function noteSource(path: string, generation: number): Promise<string> {
  try {
    return await readNote(path, generation)
  } catch (cause) {
    if (isAppError(cause) && cause.kind === 'notFound') {
      return ''
    }
    throw cause
  }
}

export function notePrivate(source: string): boolean {
  return parseFrontmatter(splitFrontmatter(source).raw).data.private
}

export function metadataValue(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function descriptionLineIndex(metadataLines: readonly string[]): number {
  return metadataLines.findIndex((candidate) => candidate.startsWith('- Description: '))
}

/** Does the raw body already carry a description metadata bullet? */
export function hasDescription(body: string): boolean {
  return descriptionLineIndex(body.slice(0, firstSectionStart(body)).split('\n')) !== -1
}

/**
 * Insert or replace the single visible generated-text surface for link
 * captures. The raw body has a `- Type: #link` anchor.
 */
export function withDescription(body: string, description: string): string {
  const line = `- Description: ${metadataValue(description)}`
  const metadataEnd = firstSectionStart(body)
  const metadataLines = body.slice(0, metadataEnd).split('\n')
  const descriptionLine = descriptionLineIndex(metadataLines)
  if (descriptionLine !== -1) {
    metadataLines[descriptionLine] = line
    return `${metadataLines.join('\n')}${body.slice(metadataEnd)}`
  }
  const typeLine = metadataLines.findIndex((candidate) => candidate.trimEnd() === '- Type: #link')
  if (typeLine === -1) {
    throw new Error('capture note is missing Type metadata')
  }
  metadataLines.splice(typeLine + 1, 0, line)
  return `${metadataLines.join('\n')}${body.slice(metadataEnd)}`
}

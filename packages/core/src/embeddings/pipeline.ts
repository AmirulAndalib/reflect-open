import { readNote } from '../graph/commands'
import { db } from '../indexing/db'
import { chunkNote } from './chunk'
import { embedApply, embedRemove, embedTexts, type EmbedChunkPayload } from './commands'

/**
 * The incremental embedding pass (Plan 09): chunk a note, diff chunk hashes
 * against the stored rows, embed only what changed, and apply as one
 * generation-pinned write. TS owns this orchestration (Rust supplies
 * `embed_texts` + the table writes), mirroring the indexing pipeline.
 */

export interface EmbedNoteOptions {
  path: string
  generation: number
  /** The model recorded per vector (from the runtime's `ready` status). */
  modelId: string
  /** Pre-loaded content (the watcher path has it); read from disk if absent. */
  content?: string
}

/**
 * Bring one note's embeddings up to date. Returns the number of chunks that
 * were (re)embedded — 0 means the hash-skip caught everything.
 */
export async function embedNote(options: EmbedNoteOptions): Promise<number> {
  const { path, generation, modelId } = options
  let content = options.content
  if (content === undefined) {
    try {
      content = await readNote(path)
    } catch {
      return 0 // deleted between event and read; the remove path handles it
    }
  }

  const chunks = await chunkNote(path, content)
  if (chunks.length === 0) {
    await embedRemove(path, generation)
    return 0
  }

  // Stored hash+model pairs: a model change makes every chunk "new", so a
  // model switch re-embeds naturally — no separate rebuild bookkeeping.
  const existing = await db
    .selectFrom('embeddingChunks')
    .where('notePath', '=', path)
    .select(['contentHash', 'modelId'])
    .execute()
  const stored = new Set(existing.map((row) => `${row.modelId} ${row.contentHash}`))

  const toEmbed = chunks.filter((chunk) => !stored.has(`${modelId} ${chunk.contentHash}`))
  const vectors = toEmbed.length > 0 ? await embedTexts(toEmbed.map((chunk) => chunk.text)) : []
  const vectorByHash = new Map(toEmbed.map((chunk, i) => [chunk.contentHash, vectors[i]]))

  const payload: EmbedChunkPayload[] = chunks.map((chunk) => ({
    heading: chunk.heading,
    posFrom: chunk.posFrom,
    posTo: chunk.posTo,
    text: chunk.text,
    contentHash: chunk.contentHash,
    modelId,
    vector: vectorByHash.get(chunk.contentHash) ?? null,
  }))
  await embedApply(path, payload, generation)
  return toEmbed.length
}

/**
 * Backfill every indexed note (initial enable, repair). Serialized; the
 * hash-skip makes re-runs cheap. Reports per-note progress.
 */
export async function backfillEmbeddings(options: {
  generation: number
  modelId: string
  onProgress?: (done: number, total: number) => void
  /** Abort between notes (e.g. graph switch). */
  isStale?: () => boolean
}): Promise<void> {
  const { generation, modelId, onProgress, isStale } = options
  const rows = await db.selectFrom('notes').select('path').orderBy('path').execute()
  let done = 0
  for (const row of rows) {
    if (isStale?.()) {
      return
    }
    try {
      await embedNote({ path: row.path, generation, modelId })
    } catch (cause) {
      console.error(`embedding backfill failed for ${row.path}:`, cause)
    }
    done += 1
    onProgress?.(done, rows.length)
  }
}

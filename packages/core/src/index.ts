/**
 * `@reflect/core` — the TypeScript business-logic layer.
 *
 * Per the architecture conventions, all reads, orchestration, AI/provider
 * calls, and privacy guards live here; the Rust shell provides only native
 * primitives. The per-domain `actions/` modules grow over the plans; this entry
 * point exposes the IPC boundary, the shared error contract, and the graph
 * file-storage layer (Plan 02).
 */
export { call } from './ipc/invoke'
export { getAppVersion } from './ipc/commands'
export { appErrorSchema, isAppError, toAppError, type AppError } from './errors'

// Graph & file storage (Plan 02)
export {
  DAILY_DIR,
  NOTES_DIR,
  ASSETS_DIR,
  dailyPath,
  notePath,
  assetPath,
  isDaily,
  dateFromDailyPath,
} from './graph/paths'
export {
  graphInfoSchema,
  recentGraphSchema,
  fileMetaSchema,
  type GraphInfo,
  type RecentGraph,
  type FileMeta,
} from './graph/schemas'
export {
  openGraph,
  createGraph,
  readNote,
  writeNote,
  writeAsset,
  moveNote,
  deleteNote,
  listFiles,
  recentGraphs,
  forgetRecent,
} from './graph/commands'

// Markdown document model (Plan 03)
export {
  frontmatterSchema,
  PARSED_NOTE_VERSION,
  splitFrontmatter,
  parseFrontmatter,
  upsertFrontmatter,
  parseBody,
  reflectMarkdownParser,
  wikiLinkExtension,
  parseNote,
  scanInlineWikiLinks,
  scanInlineImages,
  appendUnderHeading,
  renameWikiLink,
  foldKey,
  normalizeWikiTarget,
  resolved,
  resolveWikiLink,
  resolveWikiLinkAsync,
  unresolved,
  type Frontmatter,
  type Span,
  type WikiLink,
  type MarkdownLink,
  type Heading,
  type AssetRef,
  type ParsedNote,
  type InlineWikiLink,
  type InlineImage,
  type FrontmatterSplit,
  type ParsedFrontmatter,
  type NormalizedTarget,
  type Resolution,
  type WikiLookup,
  type AsyncWikiLookup,
} from './markdown'

// Local index (Plan 04)
export {
  openIndex,
  applyIndexedNote,
  applyIndexedNotes,
  removeFromIndex,
  clearIndex,
  watchStart,
  watchStop,
  subscribeIndexChanges,
  subscribeFileChanges,
  applyIndexChanges,
  hashContent,
  buildIndexedNote,
  indexedNoteSchema,
  indexedLinkSchema,
  indexedAliasSchema,
  indexNote,
  rebuildIndex,
  reconcileIndex,
  getBacklinks,
  getNote,
  getNotesByTag,
  searchNotes,
  getIndexedHashes,
  resolveWikiTarget,
  type IndexedNote,
  type IndexedLink,
  type IndexedAlias,
  type Backlink,
  type NoteRow,
  type SearchHit,
  type FileChange,
} from './indexing'

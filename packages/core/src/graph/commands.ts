import { z } from 'zod'
import { call } from '../ipc/invoke'
import {
  fileMetaSchema,
  graphInfoSchema,
  recentGraphSchema,
  type FileMeta,
  type GraphInfo,
  type RecentGraph,
} from './schemas'

/** Commands that return `()` from Rust serialize as `null` over IPC. */
const voidSchema = z.null()

/** Open an existing graph at `path` (ensures the standard layout exists). */
export async function openGraph(path: string): Promise<GraphInfo> {
  return call('graph_open', { path }, graphInfoSchema)
}

/** Create a new graph at `path` and open it. */
export async function createGraph(path: string): Promise<GraphInfo> {
  return call('graph_create', { path }, graphInfoSchema)
}

/** Read a note's markdown by graph-relative path. */
export async function readNote(path: string): Promise<string> {
  return call('note_read', { path }, z.string())
}

/** Atomically write a note's markdown by graph-relative path. */
export async function writeNote(path: string, contents: string): Promise<void> {
  await call('note_write', { path, contents }, voidSchema)
}

/** Move/rename a note within the graph. */
export async function moveNote(from: string, to: string): Promise<void> {
  await call('note_move', { from, to }, voidSchema)
}

/** Send a note to the OS trash (recoverable). */
export async function deleteNote(path: string): Promise<void> {
  await call('note_delete', { path }, voidSchema)
}

/** List markdown notes under `daily/` and `notes/`. */
export async function listFiles(): Promise<FileMeta[]> {
  return call('list_files', {}, z.array(fileMetaSchema))
}

/** The recently-opened graphs, newest first. */
export async function recentGraphs(): Promise<RecentGraph[]> {
  return call('recent_graphs', {}, z.array(recentGraphSchema))
}

/** Drop a graph from the recents list (by root path). */
export async function forgetRecent(root: string): Promise<void> {
  await call('forget_recent', { root }, voidSchema)
}

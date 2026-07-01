import type { NoteEditorHandle } from './note-editor'

/**
 * The live note editors, keyed by graph-relative path — how a palette command
 * reaches the editor for the note it targets (`CommandContext.notePath()`),
 * e.g. "Insert template…" inserting at the cursor. A module-level map, like
 * the command registry: commands run outside React, so a context provider
 * would only add a hop.
 *
 * Panes register on mount and unregister on unmount; the daily stream mounts
 * one editor per day, so several paths can be live at once.
 */

const editors = new Map<string, NoteEditorHandle>()

/** Register `handle` as the live editor for `path` (one editor per path). */
export function registerNoteEditor(path: string, handle: NoteEditorHandle): void {
  editors.set(path, handle)
}

/** Remove `path`'s registration, but only if it still points at `handle`. */
export function unregisterNoteEditor(path: string, handle: NoteEditorHandle): void {
  if (editors.get(path) === handle) {
    editors.delete(path)
  }
}

/** The live editor for `path`, or `null` when none is mounted. */
export function getNoteEditor(path: string): NoteEditorHandle | null {
  return editors.get(path) ?? null
}

/** Test hook: drop every registration. */
export function clearNoteEditors(): void {
  editors.clear()
}

import { useCallback, useMemo, type ReactElement } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { assetPath, dateFromDailyPath, isDaily, resolveWikiTarget, writeAsset } from '@reflect/core'
import { NoteEditor } from '@/editor/note-editor'
import type { ImageOptions } from '@/editor/images'
import { useNoteDocument } from '@/editor/use-note-document'
import { isIsoDate } from '@/lib/dates'
import { useGraph } from '@/providers/graph-provider'
import { useRouter } from '@/routing/router'
import type { Route } from '@/routing/route'

interface NotePaneProps {
  /** Graph-relative path of the note to edit. */
  path: string
  /** Treat a missing file as empty (created on first keystroke) — Plan 06. */
  lazy?: boolean
}

/** The route a resolved note path (daily or regular) navigates to. */
function routeForPath(path: string): Route {
  const date = isDaily(path) ? dateFromDailyPath(path) : null
  return date ? { kind: 'daily', date } : { kind: 'note', path }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * One open note: the editor bound to its on-disk document via the Plan 05 save
 * pipeline (debounced atomic writes, watcher-driven external reload, and a
 * non-destructive conflict prompt when an external change races unsaved edits).
 * Notes the editor can't faithfully round-trip open **protected** (read-only)
 * so a converter gap can never silently rewrite a file. Plan 06 mounts one of
 * these per day in the daily stream.
 */
export function NotePane({ path, lazy = false }: NotePaneProps): ReactElement {
  const { graph } = useGraph()
  const { navigate } = useRouter()
  const graphRoot = graph?.root ?? null
  const generation = graph?.generation ?? null
  const document = useNoteDocument(path, generation, { createIfMissing: lazy })

  // Mod+click on a [[wiki link]]: resolve via the index; an unresolved ISO date
  // is still a valid daily target (created lazily on first write). Unresolved
  // non-date targets are a no-op until Plan 07 adds the "create note" offer.
  const onWikiLinkClick = useCallback(
    (target: string) => {
      void (async () => {
        try {
          const resolution = await resolveWikiTarget(target)
          if (resolution.kind === 'resolved') {
            navigate(routeForPath(resolution.ref))
          } else if (isIsoDate(resolution.text)) {
            navigate({ kind: 'daily', date: resolution.text })
          }
        } catch (err) {
          console.error('wiki-link resolution failed:', err)
        }
      })()
    },
    [navigate],
  )

  const resolveUrl = useCallback(
    (src: string): string | null => {
      if (/^https?:\/\//.test(src)) {
        return src
      }
      if (graphRoot && src.startsWith('assets/')) {
        return convertFileSrc(`${graphRoot}/${src}`)
      }
      return null
    },
    [graphRoot],
  )

  const saveImage = useCallback(
    async (file: File): Promise<string | null> => {
      const extension = EXTENSION_BY_MIME[file.type]
      if (!extension || generation === null) {
        return null
      }
      const target = assetPath(`pasted-${Date.now()}.${extension}`)
      await writeAsset(target, base64Of(await file.arrayBuffer()), generation)
      return target
    },
    [generation],
  )

  const images = useMemo<ImageOptions>(() => ({ resolveUrl, saveImage }), [resolveUrl, saveImage])

  if (document.status === 'loading') {
    return (
      <div className="px-1 py-2 text-sm text-[color:var(--text-muted)]">Loading note…</div>
    )
  }

  if (document.status === 'error') {
    return (
      <div role="alert" className="px-1 py-2 text-sm text-red-500">
        Couldn’t open {path}: {document.error}
      </div>
    )
  }

  if (document.protected) {
    return (
      <div>
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          This note contains markdown the editor can’t yet reproduce faithfully (for
          example task lists), so it’s open read-only to protect your file. Edit it in
          another tool for now.
        </div>
        <pre className="reflect-protected-note whitespace-pre-wrap text-sm leading-relaxed">
          {document.initialContent}
        </pre>
      </div>
    )
  }

  return (
    <div className="relative" aria-label={`Editing ${path}`}>
      {document.error !== null ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
        >
          Saving failed: {document.error}. Your edits are kept in the editor and the next
          successful save will persist them.
        </div>
      ) : null}

      {document.conflict !== null ? (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <span className="min-w-0 flex-1">
            This note changed on disk while you had unsaved edits.
          </span>
          <button
            type="button"
            onClick={document.keepMine}
            className="rounded border border-current/30 px-2 py-0.5 font-medium"
          >
            Keep mine
          </button>
          <button
            type="button"
            onClick={document.loadTheirs}
            className="rounded border border-current/30 px-2 py-0.5 font-medium"
          >
            Load theirs
          </button>
        </div>
      ) : null}

      {document.dirty ? (
        <span
          aria-label="Unsaved changes"
          title="Unsaved changes"
          className="absolute -top-1 right-0 size-2 rounded-full bg-[var(--accent)]"
        />
      ) : null}

      <NoteEditor
        key={path}
        initialContent={document.initialContent}
        onChange={document.onEditorChange}
        images={images}
        onWikiLinkClick={onWikiLinkClick}
        handleRef={document.bindEditor}
      />
    </div>
  )
}

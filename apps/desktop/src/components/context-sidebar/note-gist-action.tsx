import { useState, type ReactElement } from 'react'
import { CloudUpload } from 'lucide-react'
import { ShortcutKeys } from '@/components/shortcut-keys'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNoteRowOverlay } from '@/hooks/note-row-overlay'
import { useGithubConnected } from '@/hooks/use-github-connected'
import { useNoteRow } from '@/hooks/use-note-row'
import { runGistPublish } from '@/lib/note-gist'
import { cn } from '@/lib/utils'
import { useGraph } from '@/providers/graph-provider'

interface NoteGistActionProps {
  /** Graph-relative path of the note the action operates on. */
  path: string
  /** Keybinding hint, from the matching command definition. */
  keybinding?: string | null
}

/**
 * Private-link sharing as a Note actions button. Rendered only when a GitHub
 * credential is stored and the note isn't private (the publish path enforces
 * the privacy block again on live content — this is just not offering it).
 * After the first publish the label flips to "Republish private link", and an
 * accent-tinted icon plus tooltip nudge when the body changed since
 * (`gist_stale` from the index). Failures surface through the operations
 * status line; success copies the gist-backed link to the clipboard.
 */
export function NoteGistAction({ path, keybinding = null }: NoteGistActionProps): ReactElement | null {
  const { graph } = useGraph()
  const connected = useGithubConnected()
  const row = useNoteRow(path)
  // `row` already reflects a just-published url (the optimistic overlay flows
  // through `useNoteRow`); the raw overlay tells us *that* a publish is still
  // catching up, which only `stale` needs.
  const optimistic = useNoteRowOverlay(path, graph?.generation)?.gistUrl != null
  const [isPublishing, setIsPublishing] = useState(false)

  const published = optimistic || (row?.gistUrl ?? null) !== null
  // While the overlay still stands in for a not-yet-indexed publish, don't nudge
  // "stale": the index reflects the pre-publish body for one more watcher
  // round-trip. The overlay is url-only — it never waits on `gist_stale`, so a
  // body edited right after publishing can't pin the nudge shut.
  const stale = !optimistic && (row?.gistStale ?? false)

  if (!connected || row?.isPrivate === true) {
    return null
  }

  const onPublish = async (): Promise<void> => {
    const generation = graph?.generation
    if (generation === undefined) {
      return
    }
    setIsPublishing(true)
    try {
      await runGistPublish(path, generation)
    } finally {
      setIsPublishing(false)
    }
  }

  const label = isPublishing
    ? 'Publishing…'
    : published
      ? 'Republish private link'
      : 'Share with private link'
  const tooltip = stale
    ? 'The note changed since its private GitHub gist was last published'
    : 'Creates a secret GitHub gist and copies its private link'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void onPublish()}
          disabled={isPublishing}
          className="group relative flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-start transition-colors duration-100 hover:bg-surface-hover disabled:opacity-50"
        >
          <span
            className={cn(
              'flex h-5 w-5 flex-none items-center justify-center transition-colors duration-100',
              stale ? 'text-accent' : 'text-text-muted group-hover:text-text',
            )}
          >
            <CloudUpload size={14} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>
          {keybinding !== null ? (
            <ShortcutKeys binding={keybinding} className="invisible group-hover:visible" />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

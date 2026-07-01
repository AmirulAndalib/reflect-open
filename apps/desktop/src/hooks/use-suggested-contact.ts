import { useQuery } from '@tanstack/react-query'
import {
  contactDetailsMarkdown,
  hasBridge,
  isContactsReadable,
  isDaily,
  parseNote,
  suggestContactForTitle,
  type ContactMatch,
} from '@reflect/core'
import { readNoteSource } from '@/lib/note-frontmatter'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'
import { useSettings } from '@/providers/settings-provider'
import { useContactsAuthorization } from './use-contacts-authorization'

export function suggestedContactQueryKey(
  graphRoot: string | undefined,
  path: string,
): readonly [typeof INDEX_QUERY_SCOPE, string | undefined, 'suggested-contact', string] {
  return [INDEX_QUERY_SCOPE, graphRoot, 'suggested-contact', path]
}

/**
 * The Apple Contact this note's title exactly matches, or `null` — the
 * suggested-contact card renders on a non-null answer. Gated hard: the
 * integration must be enabled, the permission readable, and the note a
 * non-daily one; a note whose suggestion was already resolved (the
 * `contactSuggestion` frontmatter mark, written by Add and Ignore) answers
 * `null` without a lookup.
 *
 * Keyed under the `index` scope on purpose: resolving the card writes the
 * note, the watcher re-indexes it, and the usual index invalidation refetches
 * this — the card hides through the same file-is-truth loop as everything else.
 */
export function useSuggestedContact(path: string): ContactMatch | null {
  const { graph } = useGraph()
  const { settings } = useSettings()
  const authorization = useContactsAuthorization()
  const readable = authorization !== null && isContactsReadable(authorization)
  const { data } = useQuery({
    queryKey: suggestedContactQueryKey(graph?.root, path),
    queryFn: async () => {
      const source = await readNoteSource(path)
      const note = parseNote({ path, source })
      if (note.frontmatter.contactSuggestion !== undefined) {
        return null
      }
      const match = await suggestContactForTitle(note.title)
      // A match with nothing to add (no email, no phone) has no card to offer.
      return match !== null && contactDetailsMarkdown(match) !== '' ? match : null
    },
    enabled:
      hasBridge() && graph !== null && settings.contactsEnabled && readable && !isDaily(path),
  })
  return data ?? null
}

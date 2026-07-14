import { lookupContactsByEmail, type ContactMatch } from './commands'
import { noteOwningEmail } from '../indexing/queries'
import { foldEmail } from '../markdown/email-fields'

/**
 * Attendee resolution for the calendar flow (see
 * docs/porting/calendar-meetings-integration.md): a meeting attendee's email
 * is looked up in Apple Contacts so the created person note can be pre-filled.
 * Exported ahead of that flow shipping — the suggested-contact card and the
 * meeting flow share this policy.
 */

/**
 * The candidate that actually carries `email` (exact, case-insensitive), or
 * null. The framework's email predicate can return near matches; person notes
 * must only be pre-filled from a contact that verifiably owns the address.
 * Among several owners (shared address-book entries), the named one wins.
 */
export function pickContactForEmail(
  email: string,
  candidates: readonly ContactMatch[],
): ContactMatch | null {
  const wanted = foldEmail(email)
  if (wanted === '') {
    return null
  }
  const owners = candidates.filter((candidate) =>
    candidate.emails.some((candidateEmail) => foldEmail(candidateEmail) === wanted),
  )
  if (owners.length === 0) {
    return null
  }
  return owners.find((owner) => owner.fullName.trim() !== '') ?? owners[0] ?? null
}

/** A graph person note found through one of an Apple Contact's email addresses. */
export interface ContactPersonNoteOwner {
  /** The existing `#person` note title that should become the wiki-link target. */
  readonly title: string
  /** The canonical email that matched, in the Contact's primary-first order. */
  readonly email: string
  /** Whether `[[title]]` uniquely resolves to this email-owning note. */
  readonly linkable: boolean
}

/**
 * Find an existing `#person` note owned by any of `contact`'s emails. Apple
 * Contacts orders values primary-first, so the first uniquely linkable owner
 * wins. An owner whose title is ambiguous is retained as a fallback to block
 * duplicate creation when no later address has a usable target. Repeated
 * spellings of one address are queried once through the shared folded key.
 */
export async function personNoteOwnerForContact(
  contact: ContactMatch,
): Promise<ContactPersonNoteOwner | null> {
  const seen = new Set<string>()
  let unlinkableOwner: ContactPersonNoteOwner | null = null
  for (const email of contact.emails) {
    const key = foldEmail(email)
    if (key === '' || seen.has(key)) {
      continue
    }
    seen.add(key)
    const owner = await noteOwningEmail(key)
    if (owner === null || owner.title === '') {
      continue
    }
    const match = {
      title: owner.title,
      email: key,
      linkable: owner.uniquelyAddressable,
    }
    if (match.linkable) {
      return match
    }
    unlinkableOwner ??= match
  }
  return unlinkableOwner
}

/**
 * Look up an attendee email in Apple Contacts. A null answer is the expected
 * miss — the calendar flow still creates a person note from the bare email,
 * as v1 did. Callers gate on the integration being enabled and readable.
 */
export async function resolveAttendeeContact(email: string): Promise<ContactMatch | null> {
  const key = foldEmail(email)
  if (key === '') {
    return null
  }
  const candidates = await lookupContactsByEmail(key)
  return pickContactForEmail(key, candidates)
}

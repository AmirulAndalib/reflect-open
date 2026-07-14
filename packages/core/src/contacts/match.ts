import { lookupContactsByName, type ContactMatch } from './commands'
import { contactDetailsMarkdown } from './markdown'
import { personNoteOwnerForContact } from './resolve'
import { wikiLinkSafe } from '../markdown/edit'
import { foldEmail } from '../markdown/email-fields'

/**
 * The person-note matching rule: a note earns a suggested-contact card only
 * when its title **exactly equals** a contact's full name (case-insensitive,
 * diacritic-insensitive, whitespace-collapsed). Exactness is the
 * false-positive guard the porting doc asks for — a two-word note title like
 * "Meeting Notes" never matches, and no `#person` tag or other opt-in is
 * required.
 */

/**
 * Normalize a name for exact comparison: diacritics folded (NFD, marks
 * stripped), trimmed, collapsed, lowercased. Folding matches the framework's
 * own name predicate, which is diacritic-insensitive — without it a "Rene
 * Descartes" title would *receive* the "René Descartes" candidate and then
 * silently reject it here.
 */
function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Do two person names count as the same under the matching rule? The
 * `ignoredContacts` dismissal list compares through this, so a dismissal
 * recorded as "Ada Lovelace" also covers a lookup answering "ada lovelace".
 */
export function contactNamesEqual(left: string, right: string): boolean {
  const normalized = normalizeName(left)
  return normalized !== '' && normalized === normalizeName(right)
}

/**
 * The candidate whose full name exactly equals `title`, or null.
 *
 * The framework's name predicate is word-prefix based (searching "Ada" also
 * returns "Ada Lovelace"), so this is where prefix hits are discarded. Among
 * several exact matches (two address-book entries for the same person), the
 * one with the most detail wins — a card offering an email beats an empty one.
 */
export function matchContactForTitle(
  title: string,
  candidates: readonly ContactMatch[],
): ContactMatch | null {
  const wanted = normalizeName(title)
  if (wanted === '') {
    return null
  }
  const exact = candidates.filter(
    (candidate) => normalizeName(candidate.fullName) === wanted,
  )
  if (exact.length === 0) {
    return null
  }
  const detailed = [...exact].sort(
    (left, right) =>
      right.emails.length + right.phones.length - (left.emails.length + left.phones.length),
  )
  return detailed[0] ?? null
}

/**
 * Look up `title` in Apple Contacts and apply the exact-match rule. Returns
 * null for blank titles without touching the bridge. Callers gate on the
 * integration being enabled and readable first (`isContactsReadable`).
 */
export async function suggestContactForTitle(title: string): Promise<ContactMatch | null> {
  if (title.trim() === '') {
    return null
  }
  const candidates = await lookupContactsByName(title.trim())
  return matchContactForTitle(title, candidates)
}

/**
 * A macOS Contact row prepared for a wiki-link or meeting-attendee menu.
 * `target` is an existing graph title when one of the Contact's emails owns a
 * `#person` note; otherwise it is the Contact's full name and selecting the row
 * should create that note. `email` is the matched address, or the Contact's
 * first usable address for a new note.
 */
export interface ContactLinkSuggestion {
  readonly contact: ContactMatch
  readonly target: string
  readonly email: string | null
  readonly existingPersonNote: boolean
  /** Whether `target` can be embedded verbatim inside `[[…]]`. */
  readonly linkable: boolean
}

function firstContactEmail(contact: ContactMatch): string | null {
  for (const email of contact.emails) {
    const key = foldEmail(email)
    if (key !== '') {
      return key
    }
  }
  return null
}

async function resolveContactLinkSuggestion(
  contact: ContactMatch,
): Promise<ContactLinkSuggestion> {
  const owner = await personNoteOwnerForContact(contact)
  const target = owner?.title ?? contact.fullName
  return {
    contact,
    target,
    email: owner?.email ?? firstContactEmail(contact),
    existingPersonNote: owner !== null,
    linkable: (owner?.linkable ?? true) && wikiLinkSafe(target) === target,
  }
}

async function resolveSameNameContacts(
  contacts: readonly ContactMatch[],
): Promise<ContactLinkSuggestion | null> {
  let fallback: ContactLinkSuggestion | null = null
  let unlinkableOwner: ContactLinkSuggestion | null = null
  for (const contact of contacts) {
    const suggestion = await resolveContactLinkSuggestion(contact)
    fallback ??= suggestion
    if (suggestion.existingPersonNote && suggestion.linkable) {
      return suggestion
    }
    if (suggestion.existingPersonNote) {
      unlinkableOwner ??= suggestion
    }
  }
  return unlinkableOwner ?? fallback
}

/**
 * Contacts for the `[[` link menu — v1 mixed contacts into the backlink
 * autocomplete so a person note could be born from the address book. Unlike
 * the card's exact rule, this keeps the framework's word-prefix matches
 * (typing "Ada" should offer "Ada Lovelace"); contacts without a name or any
 * details are dropped, mirroring v1's valid-contact filter. Queries shorter
 * than two characters answer empty — one letter matches half the address
 * book. Each result is resolved against existing `#person` email ownership
 * before it reaches the menu; `linkable` says whether its `target` is safe to
 * insert. Callers gate on the integration being enabled and readable.
 */
export async function contactLinkSuggestions(
  query: string,
  limit = 4,
): Promise<ContactLinkSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) {
    return []
  }
  const candidates = await lookupContactsByName(trimmed)
  const contactsByName = new Map<string, ContactMatch[]>()
  for (const candidate of candidates) {
    const key = normalizeName(candidate.fullName)
    if (key === '' || contactDetailsMarkdown(candidate) === '') {
      continue
    }
    const sameName = contactsByName.get(key)
    if (sameName !== undefined) {
      sameName.push(candidate)
      continue
    }
    if (contactsByName.size < limit) {
      contactsByName.set(key, [candidate])
    }
  }
  const resolved = await Promise.all(
    [...contactsByName.values()].map(resolveSameNameContacts),
  )
  return resolved.filter(
    (suggestion): suggestion is ContactLinkSuggestion => suggestion !== null,
  )
}

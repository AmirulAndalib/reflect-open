import {
  contactNamesEqual,
  foldFallbackTitleKey,
  foldKey,
  type ContactLinkSuggestion,
  type WikiSuggestion,
} from '@reflect/core'

/**
 * Pure assembly of the `[[` popover's rows (Plan 07): the ranked index
 * suggestions and Apple Contacts rows (the contacts-integration port — v1
 * mixed contacts into the backlink menu so a person note could be born from
 * the address book), plus a trailing `Create "<query>"` row when nothing
 * matches the typed text exactly. An exact contact whose email already owns a
 * note leads the list; otherwise ranked note suggestions stay first. Factored
 * from the component so the rules are unit-testable.
 */

export type AutocompleteEntry =
  | { kind: 'suggestion'; suggestion: WikiSuggestion }
  | { kind: 'contact'; suggestion: ContactLinkSuggestion }
  | { kind: 'create'; title: string }

export interface EntryOptions {
  /**
   * Whether a Create row may be offered at all — false while suggestions for
   * the current query are still in flight (the visible list belongs to a
   * previous query, so "nothing matches" can't be concluded yet).
   */
  offerCreate: boolean
  /**
   * Apple Contacts matching the query (empty when the integration is off).
   * Each carries its email-resolved graph target. A contact whose target would
   * resolve to an existing suggestion is dropped because the note row already
   * covers it; an un-linkable contact still suppresses a duplicate Create row.
   */
  contacts?: readonly ContactLinkSuggestion[]
}

export function buildAutocompleteEntries(
  query: string,
  suggestions: WikiSuggestion[],
  options: EntryOptions = { offerCreate: true },
): AutocompleteEntry[] {
  const title = query.trim()
  const key = foldKey(title)
  const contactSuggestions = options.contacts ?? []

  // Exact folding matches ordinary link resolution. The fallback set also
  // prevents a contact action from creating through the same leading-emoji
  // collision this menu protects for bare Create rows.
  const resolvable = new Set<string>()
  const fallbackResolvable = new Set<string>()
  for (const suggestion of suggestions) {
    resolvable.add(foldKey(suggestion.target))
    fallbackResolvable.add(foldFallbackTitleKey(suggestion.target))
    if (suggestion.alias !== null) {
      resolvable.add(foldKey(suggestion.alias))
      fallbackResolvable.add(foldFallbackTitleKey(suggestion.alias))
    }
  }
  // An exact Contacts name whose email already owns a person note is the
  // canonical answer for that contact. Put it ahead of a different same-name
  // note so Enter follows stable email identity; keep that other note visible
  // immediately after it for an intentional name-based choice.
  const preferredContact = contactSuggestions.find(
    (suggestion) =>
      suggestion.linkable &&
      suggestion.existingPersonNote &&
      contactNamesEqual(suggestion.contact.fullName, title),
  )
  const preferredTargetKey =
    preferredContact === undefined ? null : foldKey(preferredContact.target)
  const entries: AutocompleteEntry[] = []
  if (preferredContact !== undefined) {
    entries.push({ kind: 'contact', suggestion: preferredContact })
  }
  entries.push(
    ...suggestions
      .filter(
        (suggestion) =>
          preferredTargetKey === null || foldKey(suggestion.target) !== preferredTargetKey,
      )
      .map((suggestion) => ({ kind: 'suggestion' as const, suggestion })),
  )

  const contactTargets = new Set<string>(
    preferredTargetKey === null ? [] : [preferredTargetKey],
  )
  const contacts = contactSuggestions.filter((suggestion) => {
    if (suggestion === preferredContact) {
      return false
    }
    if (!suggestion.linkable) {
      return false
    }
    const targetKey = foldKey(suggestion.target)
    const fallbackTargetKey = foldFallbackTitleKey(suggestion.target)
    if (
      resolvable.has(targetKey) ||
      fallbackResolvable.has(fallbackTargetKey) ||
      contactTargets.has(targetKey)
    ) {
      return false
    }
    contactTargets.add(targetKey)
    return true
  })
  entries.push(...contacts.map((suggestion) => ({ kind: 'contact' as const, suggestion })))

  if (title === '' || !options.offerCreate) {
    return entries
  }
  // An exact title, alias, or date hit means the link would resolve as typed —
  // nothing to create. (A full `YYYY-MM-DD` query always has its daily
  // suggestion injected by the query layer, so dates never offer a create.)
  const resolvesAsTyped = resolvable.has(key)
  // A leading-emoji/whitespace fallback candidate is either the existing note
  // to reuse or an ambiguity to leave unresolved. Neither case may offer a
  // duplicate-creating row.
  const fallbackKey = foldFallbackTitleKey(title)
  const hasFallbackCollision =
    fallbackKey !== '' && fallbackResolvable.has(fallbackKey)
  // A generated date suggestion means the query reads as a date — "3 days ago",
  // "next friday" — so offering to create a note with that literal title would
  // be noise.
  const hasDateSuggestion = suggestions.some((suggestion) => suggestion.generated !== undefined)
  // A contact row for the exact typed name IS the create action (prefilled) —
  // a bare Create row beside it would just be the worse duplicate.
  const contactCoversQuery = contactSuggestions.some(
    ({ contact }) => contactNamesEqual(contact.fullName, title),
  )
  if (!resolvesAsTyped && !hasFallbackCollision && !hasDateSuggestion && !contactCoversQuery) {
    entries.push({ kind: 'create', title })
  }
  return entries
}

import { appendBlock } from '../markdown/edit'
import type { ContactMatch } from './commands'

/**
 * What the suggested-contact card's **Add** writes: the contact's primary
 * details as plain markdown bullets, owned by the graph from that moment on.
 * Nothing links back to the address book — later corrections happen in the
 * note, exactly like any other markdown.
 */

/**
 * The details block for `contact`: primary email and phone as bullets, in
 * that order. A contact with neither yields the empty string (the card
 * should not offer Add in that case).
 */
export function contactDetailsMarkdown(contact: ContactMatch): string {
  const lines: string[] = []
  const email = contact.emails[0]
  if (email !== undefined && email.trim() !== '') {
    lines.push(`- Email: ${email.trim()}`)
  }
  const phone = contact.phones[0]
  if (phone !== undefined && phone.trim() !== '') {
    lines.push(`- Phone: ${phone.trim()}`)
  }
  return lines.join('\n')
}

/**
 * Append `contact`'s details block to a note's source via {@link appendBlock}
 * (own paragraph, blank-line separated — the block form the meowdown
 * serializer normalizes to). A contact with no details returns the source
 * unchanged.
 */
export function appendContactDetails(source: string, contact: ContactMatch): string {
  const details = contactDetailsMarkdown(contact)
  if (details === '') {
    return source
  }
  return appendBlock(source, details)
}

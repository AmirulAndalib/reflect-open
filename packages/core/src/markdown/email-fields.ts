/**
 * Contact-field emails — the `- Email: ada@example.com` bullet shape of v1's
 * person template, written today by the contacts integration
 * (`contactDetailsMarkdown`) and the meeting flow's person-note pre-fill.
 * The indexer projects these into `note_emails` so an invite email can find
 * the person note that owns it (attendee resolution in the calendar flow).
 *
 * Ownership is deliberately narrow: only an explicit `Email:` field bullet
 * counts. A bare address in prose — a daily note quoting an email, a meeting
 * note pasting a thread — is a mention, not ownership, and must not capture
 * the address.
 */

/** An `Email:` field bullet (any list marker, any case), capturing its value. */
const EMAIL_FIELD_PATTERN = /^[ \t]*[-+*][ \t]+email:(.*)$/gim

/**
 * An address inside a field value (tolerates `mailto:` links and commas —
 * excluding `:` keeps the scheme out of the local part).
 */
const EMAIL_PATTERN = /[^\s@<>(),;:[\]]+@[^\s@<>(),;:[\]]+\.[^\s@<>(),;:[\]]+/g

/**
 * Normalize an email identity for matching: unwrap an optional display-name or
 * angle-bracket envelope, drop an optional `mailto:` prefix, trim, and
 * lowercase. The address itself stays otherwise intact — provider-specific
 * rules such as removing dots or `+tags` would merge distinct mailboxes.
 */
export function foldEmail(email: string): string {
  const trimmed = email.trim()
  const wrapped = trimmed.match(/^(?:[^<>]*)<\s*([^<>]+)\s*>$/)
  const address = (wrapped?.[1] ?? trimmed).replace(/^mailto:/i, '').trim()
  return address.toLowerCase()
}

/**
 * Every email a note body owns via `- Email:` field bullets, in document
 * order, case-insensitively deduplicated (first casing kept). One bullet may
 * carry several addresses (comma-separated, or a `mailto:` link whose text
 * repeats the address — the dedup collapses that pair). Run this on the
 * body, frontmatter split off.
 */
export function extractEmailFields(body: string): string[] {
  const seen = new Set<string>()
  const emails: string[] = []
  for (const field of body.matchAll(EMAIL_FIELD_PATTERN)) {
    const value = field[1] ?? ''
    for (const match of value.matchAll(EMAIL_PATTERN)) {
      // The field value is free-form prose; a sentence-final dot glued to an
      // address is punctuation, not domain.
      const email = match[0].replace(/\.+$/, '')
      const key = foldEmail(email)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      emails.push(email)
    }
  }
  return emails
}

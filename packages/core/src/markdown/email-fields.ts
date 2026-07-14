/**
 * Contact-field emails — the canonical `- Email: ada@example.com` V2 shape,
 * plus V1's `- Email:` / nested-value shape. The indexer projects these into
 * `note_emails` so an invite email can find the person note that owns it
 * (attendee resolution in the calendar flow).
 *
 * Ownership is deliberately narrow: only an explicit `Email:` field bullet
 * counts. A bare address in prose — a daily note quoting an email, a meeting
 * note pasting a thread — is a mention, not ownership, and must not capture
 * the address.
 */

/**
 * An `Email:` field bullet (or pre-2023 V1 `Emails`), capturing indentation
 * and an optional inline value. A missing colon is accepted only when the
 * label occupies the whole list item, so prose such as "Emails from Ada"
 * cannot claim ownership.
 */
const EMAIL_FIELD_PATTERN = /^([ \t]*)[-+*][ \t]+emails?[ \t]*(?::[ \t]*(.*))?$/i

/** A nested unordered-list item, capturing indentation and value. */
const LIST_ITEM_PATTERN = /^([ \t]*)[-+*][ \t]+(.*)$/
const LEADING_WHITESPACE_PATTERN = /^[ \t]*/
const MARKDOWN_TAB_WIDTH = 4

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

function indentationWidth(whitespace: string): number {
  let width = 0
  for (const character of whitespace) {
    if (character === '\t') {
      width += MARKDOWN_TAB_WIDTH - (width % MARKDOWN_TAB_WIDTH)
    } else {
      width += 1
    }
  }
  return width
}

function appendEmails(value: string, seen: Set<string>, emails: string[]): void {
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

/**
 * Every email a note body owns via a contact field, in document order and
 * case-insensitively deduplicated (first casing kept). V2 writes the value on
 * the `- Email:` line. V1 wrote an empty `- Email:` parent (or older `- Emails`)
 * followed by nested address bullets; only descendant unordered-list items
 * belong to that legacy field. One value may carry several addresses or a
 * `mailto:` link whose text repeats the address — dedup collapses that pair.
 * Run this on the body, frontmatter split off.
 */
export function extractEmailFields(body: string): string[] {
  const seen = new Set<string>()
  const emails: string[] = []
  let legacyParentIndent: number | null = null

  for (const line of body.split(/\r?\n/)) {
    const field = line.match(EMAIL_FIELD_PATTERN)
    if (field !== null) {
      const inlineValue = field[2] ?? ''
      appendEmails(inlineValue, seen, emails)
      legacyParentIndent = inlineValue.trim() === '' ? indentationWidth(field[1] ?? '') : null
      continue
    }

    if (legacyParentIndent === null || line.trim() === '') {
      continue
    }

    const item = line.match(LIST_ITEM_PATTERN)
    const whitespace = item?.[1] ?? line.match(LEADING_WHITESPACE_PATTERN)?.[0] ?? ''
    if (indentationWidth(whitespace) <= legacyParentIndent) {
      legacyParentIndent = null
      continue
    }
    if (item !== null) {
      appendEmails(item[2] ?? '', seen, emails)
    }
  }
  return emails
}

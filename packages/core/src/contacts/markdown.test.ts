import { describe, expect, it } from 'vitest'
import type { ContactMatch } from './commands'
import { appendContactDetails, contactDetailsMarkdown } from './markdown'

function contact(overrides: Partial<ContactMatch>): ContactMatch {
  return {
    fullName: 'Ada Lovelace',
    givenName: 'Ada',
    familyName: 'Lovelace',
    emails: [],
    phones: [],
    ...overrides,
  }
}

describe('contactDetailsMarkdown', () => {
  it('writes the primary email and phone as bullets', () => {
    const details = contactDetailsMarkdown(
      contact({ emails: ['ada@example.com', 'ada@work.com'], phones: ['+1 555 0100'] }),
    )
    expect(details).toBe('- Email: ada@example.com\n- Phone: +1 555 0100')
  })

  it('omits missing fields entirely', () => {
    expect(contactDetailsMarkdown(contact({ phones: ['+1 555 0100'] }))).toBe(
      '- Phone: +1 555 0100',
    )
    expect(contactDetailsMarkdown(contact({}))).toBe('')
  })

  it('skips blank field values instead of writing empty bullets', () => {
    expect(contactDetailsMarkdown(contact({ emails: ['  '] }))).toBe('')
  })
})

describe('appendContactDetails', () => {
  const ada = contact({ emails: ['ada@example.com'], phones: ['+1 555 0100'] })

  it('appends after existing content with a blank-line block separation', () => {
    expect(appendContactDetails('# Ada Lovelace\n\nMet at the conference.\n', ada)).toBe(
      '# Ada Lovelace\n\nMet at the conference.\n\n- Email: ada@example.com\n- Phone: +1 555 0100\n',
    )
  })

  it('fills an empty body without leading blank lines', () => {
    expect(appendContactDetails('', ada)).toBe(
      '- Email: ada@example.com\n- Phone: +1 555 0100\n',
    )
  })

  it('preserves frontmatter byte-for-byte', () => {
    const source = '---\nprivate: true\n---\nBody line.\n'
    expect(appendContactDetails(source, ada)).toBe(
      '---\nprivate: true\n---\nBody line.\n\n- Email: ada@example.com\n- Phone: +1 555 0100\n',
    )
  })

  it('appends into a frontmatter-only note after the block', () => {
    const source = '---\npinned: true\n---\n'
    expect(appendContactDetails(source, ada)).toBe(
      '---\npinned: true\n---\n\n- Email: ada@example.com\n- Phone: +1 555 0100\n',
    )
  })

  it('is a no-op for a contact with no details', () => {
    const source = '# Ada Lovelace\n'
    expect(appendContactDetails(source, contact({}))).toBe(source)
  })
})

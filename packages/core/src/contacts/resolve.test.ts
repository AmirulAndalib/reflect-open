import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import type { ContactMatch } from './commands'
import {
  personNoteOwnerForContact,
  pickContactForEmail,
  resolveAttendeeContact,
} from './resolve'

function contact(overrides: Partial<ContactMatch>): ContactMatch {
  return {
    fullName: '',
    givenName: '',
    familyName: '',
    emails: [],
    phones: [],
    ...overrides,
  }
}

afterEach(() => {
  setBridge(null)
})

describe('pickContactForEmail', () => {
  it('picks the candidate that owns the email, case-insensitively', () => {
    const ada = contact({ fullName: 'Ada Lovelace', emails: ['Ada@Example.com'] })
    expect(pickContactForEmail('ada@example.com', [ada])).toBe(ada)
  })

  it('treats wrapped and bare addresses as the same owner', () => {
    const ada = contact({ fullName: 'Ada Lovelace', emails: ['<Ada@Example.com>'] })
    expect(pickContactForEmail('ada@example.com', [ada])).toBe(ada)
    expect(pickContactForEmail('<ada@example.com>', [ada])).toBe(ada)
  })

  it('rejects near matches that do not carry the exact address', () => {
    const other = contact({ fullName: 'Ada Lovelace', emails: ['ada@other.com'] })
    expect(pickContactForEmail('ada@example.com', [other])).toBeNull()
  })

  it('prefers a named owner over a nameless one', () => {
    const nameless = contact({ emails: ['ada@example.com'] })
    const named = contact({ fullName: 'Ada Lovelace', emails: ['ada@example.com'] })
    expect(pickContactForEmail('ada@example.com', [nameless, named])).toBe(named)
  })

  it('returns null for a blank email', () => {
    expect(pickContactForEmail('  ', [contact({ emails: [''] })])).toBeNull()
  })
})

describe('resolveAttendeeContact', () => {
  it('short-circuits blank emails without touching the bridge', async () => {
    const invoke = vi.fn()
    setBridge({ invoke, listen: async () => () => {} })
    await expect(resolveAttendeeContact(' ')).resolves.toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('looks up the canonical bare email and applies the ownership rule', async () => {
    const invoke = vi.fn().mockResolvedValue([
      {
        fullName: 'Ada Lovelace',
        givenName: 'Ada',
        familyName: 'Lovelace',
        emails: ['ada@example.com'],
        phones: [],
      },
    ])
    setBridge({ invoke, listen: async () => () => {} })

    const match = await resolveAttendeeContact(' <Ada@Example.com> ')
    expect(match?.fullName).toBe('Ada Lovelace')
    expect(invoke).toHaveBeenCalledWith('contacts_lookup_by_email', {
      email: 'ada@example.com',
    })
  })

  it('resolves null on a miss (the flow then creates a bare person note)', async () => {
    setBridge({ invoke: async () => [], listen: async () => () => {} })
    await expect(resolveAttendeeContact('nobody@example.com')).resolves.toBeNull()
  })
})

describe('personNoteOwnerForContact', () => {
  it('checks unique contact emails in primary-first order', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ title: 'Ada Byron', path: 'notes/ada-byron.md' }])
      .mockResolvedValueOnce([{ path: 'notes/ada-byron.md' }])
    setBridge({ invoke, listen: async () => () => {} })

    await expect(
      personNoteOwnerForContact(
        contact({
          emails: [
            '<Primary@Example.com>',
            'primary@example.com',
            'Secondary@Example.com',
          ],
        }),
      ),
    ).resolves.toEqual({
      title: 'Ada Byron',
      email: 'secondary@example.com',
      linkable: true,
    })

    const emailLookups = invoke.mock.calls.filter(([, args]) =>
      String(args['sql']).includes('note_emails'),
    )
    expect(emailLookups.map(([, args]) => args['params'])).toEqual([
      ['primary@example.com', 'person', 'note'],
      ['secondary@example.com', 'person', 'note'],
    ])
  })

  it('returns the first owned address without checking later emails', async () => {
    const invoke = vi.fn(async (_command: string, args: Record<string, unknown>) =>
      String(args['sql']).includes('note_emails')
        ? [{ title: 'Primary Owner', path: 'notes/primary-owner.md' }]
        : [{ path: 'notes/primary-owner.md' }],
    )
    setBridge({ invoke, listen: async () => () => {} })

    await expect(
      personNoteOwnerForContact(
        contact({ emails: ['primary@example.com', 'secondary@example.com'] }),
      ),
    ).resolves.toEqual({
      title: 'Primary Owner',
      email: 'primary@example.com',
      linkable: true,
    })
    expect(
      invoke.mock.calls.filter(([, args]) => String(args['sql']).includes('note_emails')),
    ).toHaveLength(1)
  })

  it('preserves an owner whose title is ambiguous so creation can be suppressed', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce([{ title: 'Ada Lovelace', path: 'notes/ada-2.md' }])
      .mockResolvedValueOnce([{ path: 'notes/ada.md' }, { path: 'notes/ada-2.md' }])
    setBridge({ invoke, listen: async () => () => {} })

    await expect(
      personNoteOwnerForContact(contact({ emails: ['ada@example.com'] })),
    ).resolves.toEqual({
      title: 'Ada Lovelace',
      email: 'ada@example.com',
      linkable: false,
    })
  })
})

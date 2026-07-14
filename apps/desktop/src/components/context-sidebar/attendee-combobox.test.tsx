import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ContactLinkSuggestion,
  ContactMatch,
  MeetingAttendee,
  WikiSuggestion,
} from '@reflect/core'
import { AttendeeCombobox } from './attendee-combobox'

// jsdom can't scroll or observe resizes; cmdk scrolls the highlighted row
// into view and Radix's popper observes the anchor.
window.HTMLElement.prototype.scrollIntoView = () => {}
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver

const suggestWikiTargets = vi.hoisted(() => vi.fn<() => Promise<WikiSuggestion[]>>(async () => []))
const contactLinkSuggestions = vi.hoisted(() =>
  vi.fn<() => Promise<ContactLinkSuggestion[]>>(async () => []),
)
vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  hasBridge: () => true,
  suggestWikiTargets,
  contactLinkSuggestions,
}))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', generation: 1 } }),
}))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: { contactsEnabled: true }, updateSettings: () => {} }),
}))
vi.mock('@/hooks/use-contacts-authorization', () => ({
  useContactsAuthorization: () => 'authorized',
}))

function noteSuggestion(title: string, overrides: Partial<WikiSuggestion> = {}): WikiSuggestion {
  return { target: title, path: `notes/${title}.md`, title, alias: null, date: null, ...overrides }
}

function contact(fullName: string, email: string): ContactLinkSuggestion {
  const matchedContact: ContactMatch = {
    fullName,
    givenName: '',
    familyName: '',
    emails: [email],
    phones: [],
  }
  return {
    contact: matchedContact,
    target: fullName,
    email,
    existingPersonNote: false,
    linkable: true,
  }
}

const onAdd = vi.fn<(attendee: MeetingAttendee) => void>()

function renderCombobox(attendees: MeetingAttendee[] = []): HTMLInputElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AttendeeCombobox attendees={attendees} onAdd={onAdd} />
    </QueryClientProvider>,
  )
  return screen.getByPlaceholderText<HTMLInputElement>('Add attendee')
}

/** cmdk highlights the first row in an effect — selection isn't synchronous. */
async function findHighlighted(text: string): Promise<HTMLElement> {
  const row = await screen.findByText(text)
  const item = row.closest('[cmdk-item]')
  await waitFor(() => expect(item?.getAttribute('aria-selected')).toBe('true'))
  return row
}

beforeEach(() => {
  suggestWikiTargets.mockReset().mockResolvedValue([])
  contactLinkSuggestions.mockReset().mockResolvedValue([])
  onAdd.mockClear()
})

afterEach(cleanup)

describe('AttendeeCombobox', () => {
  it('Enter adds the highlighted note suggestion by its canonical title', async () => {
    suggestWikiTargets.mockResolvedValue([noteSuggestion('Ada Lovelace')])
    const input = renderCombobox()

    fireEvent.change(input, { target: { value: 'ada' } })
    await findHighlighted('Ada Lovelace')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onAdd).toHaveBeenCalledWith({ name: 'Ada Lovelace' })
    expect(input.value).toBe('')
  })

  it('a picked contact carries its invite email for the note pre-fill', async () => {
    contactLinkSuggestions.mockResolvedValue([contact('Grace Hopper', 'grace@example.com')])
    const input = renderCombobox()

    fireEvent.change(input, { target: { value: 'gra' } })
    await findHighlighted('Grace Hopper')
    expect(screen.getByText('grace@example.com')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onAdd).toHaveBeenCalledWith({ name: 'Grace Hopper', email: 'grace@example.com' })
  })

  it('a picked contact uses the person note found through any contact email', async () => {
    contactLinkSuggestions.mockResolvedValue([
      {
        contact: {
          fullName: 'Jane Smith',
          givenName: 'Jane',
          familyName: 'Smith',
          emails: ['jane@personal.example', '<jane@corp.example>'],
          phones: [],
        },
        target: 'Jane Doe',
        email: 'jane@corp.example',
        existingPersonNote: true,
        linkable: true,
      },
    ])
    const input = renderCombobox()

    fireEvent.change(input, { target: { value: 'jan' } })
    await findHighlighted('Jane Smith')
    expect(screen.getByText('jane@corp.example → Jane Doe')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onAdd).toHaveBeenCalledWith({ name: 'Jane Doe', email: 'jane@corp.example' })
  })

  it('does not add typed text when an exact contact has an unlinkable email owner', async () => {
    suggestWikiTargets.mockResolvedValue([noteSuggestion('Jane Smythe')])
    contactLinkSuggestions.mockResolvedValue([
      {
        ...contact('Jane Smith', 'jane@corp.example'),
        target: 'Jane Doe',
        existingPersonNote: true,
        linkable: false,
      },
    ])
    const input = renderCombobox()

    fireEvent.change(input, { target: { value: 'Jane Smith' } })
    await findHighlighted('Jane Smythe')
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Jane Smythe')).toBeNull())

    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(onAdd).not.toHaveBeenCalled()
    expect(input.value).toBe('Jane Smith')
  })

  it('Enter adds the typed name once the current lookup settles', async () => {
    const input = renderCombobox()

    fireEvent.change(input, { target: { value: 'Brand New Person' } })
    await findHighlighted('Add “Brand New Person”')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onAdd).toHaveBeenCalledWith({ name: 'Brand New Person' })
    expect(input.value).toBe('')
  })

  it('Enter during a pending refetch adds neither typed text nor a stale row', async () => {
    suggestWikiTargets.mockResolvedValue([noteSuggestion('Ada Lovelace')])
    const input = renderCombobox()

    fireEvent.change(input, { target: { value: 'ada' } })
    await findHighlighted('Ada Lovelace')

    // Keep typing: the popover still shows the previous query's rows
    // (keepPreviousData) while the new fetch hangs. Enter must wait rather
    // than take either the stale row or unverified live text.
    suggestWikiTargets.mockReturnValue(new Promise(() => {}))
    fireEvent.change(input, { target: { value: 'Adam Smith' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onAdd).not.toHaveBeenCalled()
    expect(input.value).toBe('Adam Smith')
  })

  it('a quick Enter cannot outrun an exact contact owner lookup', async () => {
    let resolveContacts: (contacts: ContactLinkSuggestion[]) => void = () => {}
    contactLinkSuggestions.mockReturnValue(
      new Promise((resolve) => {
        resolveContacts = resolve
      }),
    )
    const input = renderCombobox()

    fireEvent.change(input, { target: { value: 'Jane Smith' } })
    await waitFor(() => expect(contactLinkSuggestions).toHaveBeenCalled())
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onAdd).not.toHaveBeenCalled()
    expect(input.value).toBe('Jane Smith')

    await act(async () => {
      resolveContacts([
        {
          ...contact('Jane Smith', 'jane@corp.example'),
          target: 'Jane Doe',
          existingPersonNote: true,
          linkable: false,
        },
      ])
    })
  })

  it('offers an Add row for a name that matches nothing exactly', async () => {
    suggestWikiTargets.mockResolvedValue([noteSuggestion('Ada Lovelace')])
    const input = renderCombobox()

    fireEvent.change(input, { target: { value: 'Ada L' } })
    const addRow = await screen.findByText('Add “Ada L”')
    fireEvent.click(addRow)

    expect(onAdd).toHaveBeenCalledWith({ name: 'Ada L' })
  })

  it('keeps already-added attendees out of the suggestions', async () => {
    suggestWikiTargets.mockResolvedValue([noteSuggestion('Ada Lovelace')])
    const input = renderCombobox([{ name: 'Ada Lovelace' }])

    fireEvent.change(input, { target: { value: 'Ada Lovelace' } })
    await waitFor(() => expect(suggestWikiTargets).toHaveBeenCalled())

    expect(screen.queryByText('Ada Lovelace')).toBeNull()
  })

  it('Escape dismisses the suggestions without bubbling to the dialog', async () => {
    suggestWikiTargets.mockResolvedValue([noteSuggestion('Ada Lovelace')])
    const input = renderCombobox()

    fireEvent.change(input, { target: { value: 'ada' } })
    await findHighlighted('Ada Lovelace')
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).toBeNull())
    expect(input.value).toBe('ada')
  })
})

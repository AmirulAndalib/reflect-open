import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearNoteFocus, peekNoteFocus, requestNoteFocus } from './note-focus-request'

describe('note-focus-request', () => {
  afterEach(() => {
    clearNoteFocus('notes/a.md')
    clearNoteFocus('notes/b.md')
    vi.useRealTimers()
  })

  it('peeks a live request for the requested path only', () => {
    requestNoteFocus('notes/a.md')
    expect(peekNoteFocus('notes/a.md')).toBe(true)
    expect(peekNoteFocus('notes/b.md')).toBe(false)
  })

  it('is empty until requested', () => {
    expect(peekNoteFocus('notes/a.md')).toBe(false)
  })

  it('peek does not consume — clear does', () => {
    requestNoteFocus('notes/a.md')
    expect(peekNoteFocus('notes/a.md')).toBe(true)
    expect(peekNoteFocus('notes/a.md')).toBe(true)
    clearNoteFocus('notes/a.md')
    expect(peekNoteFocus('notes/a.md')).toBe(false)
  })

  it('clearing another path leaves the request alone', () => {
    requestNoteFocus('notes/a.md')
    clearNoteFocus('notes/b.md')
    expect(peekNoteFocus('notes/a.md')).toBe(true)
  })

  it('a newer request replaces the pending one', () => {
    requestNoteFocus('notes/a.md')
    requestNoteFocus('notes/b.md')
    expect(peekNoteFocus('notes/a.md')).toBe(false)
    expect(peekNoteFocus('notes/b.md')).toBe(true)
  })

  it('expires after its TTL', () => {
    vi.useFakeTimers()
    requestNoteFocus('notes/a.md')
    vi.advanceTimersByTime(3001)
    expect(peekNoteFocus('notes/a.md')).toBe(false)
  })
})

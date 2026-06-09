import { describe, expect, it } from 'vitest'
import { flushAllNotes, registerFlush } from './flush-registry'

describe('flush registry', () => {
  it('flushes every registered buffer and awaits completion', async () => {
    const flushed: string[] = []
    const unregisterA = registerFlush(async () => {
      await Promise.resolve() // lands a microtask later, like a real write
      flushed.push('a')
    })
    const unregisterB = registerFlush(async () => {
      flushed.push('b')
    })
    try {
      await flushAllNotes()
      expect(flushed.sort()).toEqual(['a', 'b'])
    } finally {
      unregisterA()
      unregisterB()
    }
  })

  it('does not call an unregistered flush', async () => {
    const flushed: string[] = []
    registerFlush(async () => {
      flushed.push('gone')
    })()
    await flushAllNotes()
    expect(flushed).toEqual([])
  })

  it('a failing flush neither blocks the others nor rejects', async () => {
    const flushed: string[] = []
    const unregisterA = registerFlush(() => Promise.reject(new Error('disk full')))
    const unregisterB = registerFlush(async () => {
      flushed.push('b')
    })
    try {
      await expect(flushAllNotes()).resolves.toBeUndefined()
      expect(flushed).toEqual(['b'])
    } finally {
      unregisterA()
      unregisterB()
    }
  })

  it('resolves with nothing registered', async () => {
    await expect(flushAllNotes()).resolves.toBeUndefined()
  })
})

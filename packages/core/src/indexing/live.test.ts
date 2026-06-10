import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { applyIndexChanges, subscribeIndexChanges } from './live'
import type { FileChange } from './file-changes'

afterEach(() => {
  setBridge(null)
})

/** Bridge fake recording invokes; `listen` hands the emitter back to the test. */
function fakeBridge(invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>) {
  let emit: ((payload: unknown) => void) | null = null
  setBridge({
    invoke,
    listen: async (_event, handler) => {
      emit = handler
      return () => {
        emit = null
      }
    },
  })
  return { emitChanges: (payload: unknown) => emit?.(payload) }
}

describe('applyIndexChanges', () => {
  it('reports a failing change and continues with the rest of the batch', async () => {
    const applied: string[] = []
    fakeBridge(async (command, args) => {
      if (command === 'note_read') {
        if (args.path === 'notes/bad.md') {
          throw { kind: 'io', message: 'unreadable' }
        }
        return '# ok'
      }
      if (command === 'index_apply') {
        applied.push((args.note as { path: string }).path)
      }
      return null
    })

    const failures: Array<{ change: FileChange }> = []
    await applyIndexChanges(
      [
        { path: 'notes/bad.md', kind: 'upsert' },
        { path: 'notes/good.md', kind: 'upsert' },
      ],
      3,
      (_error, change) => failures.push({ change }),
    )

    expect(applied).toEqual(['notes/good.md'])
    expect(failures.map((failure) => failure.change.path)).toEqual(['notes/bad.md'])
  })

  it('routes removes to index_remove at the given generation', async () => {
    const calls: Array<[string, Record<string, unknown>]> = []
    fakeBridge(async (command, args) => {
      calls.push([command, args])
      return null
    })

    await applyIndexChanges([{ path: 'notes/gone.md', kind: 'remove' }], 9)
    expect(calls).toEqual([['index_remove', { path: 'notes/gone.md', generation: 9 }]])
  })
})

describe('subscribeIndexChanges', () => {
  it('serializes overlapping batches so later events cannot overtake earlier ones', async () => {
    const order: string[] = []
    let releaseFirstRead: () => void = () => {}
    const { emitChanges } = fakeBridge(async (command, args) => {
      if (command === 'note_read') {
        order.push(`read:${String(args.path)}`)
        if (args.path === 'notes/slow.md') {
          await new Promise<void>((resolve) => {
            releaseFirstRead = resolve
          })
        }
        return '# content'
      }
      if (command === 'index_apply') {
        order.push(`apply:${(args.note as { path: string }).path}`)
      }
      return null
    })

    await subscribeIndexChanges(1)
    emitChanges([{ path: 'notes/slow.md', kind: 'upsert' }])
    emitChanges([{ path: 'notes/fast.md', kind: 'upsert' }])
    await vi.waitFor(() => {
      expect(order).toContain('read:notes/slow.md')
    })
    // The second batch must not start while the first is still applying.
    expect(order).not.toContain('read:notes/fast.md')

    releaseFirstRead()
    await vi.waitFor(() => {
      expect(order).toContain('apply:notes/fast.md')
    })
    expect(order).toEqual([
      'read:notes/slow.md',
      'apply:notes/slow.md',
      'read:notes/fast.md',
      'apply:notes/fast.md',
    ])
  })

  it('fires onApplied only after the batch has been written to the index', async () => {
    const order: string[] = []
    const { emitChanges } = fakeBridge(async (command, args) => {
      if (command === 'note_read') {
        return '# content'
      }
      if (command === 'index_apply') {
        order.push(`apply:${(args.note as { path: string }).path}`)
      }
      return null
    })

    await subscribeIndexChanges(1, (changes) => {
      order.push(`applied:${changes.map((change) => change.path).join(',')}`)
    })
    emitChanges([{ path: 'notes/a.md', kind: 'upsert' }])
    await vi.waitFor(() => {
      expect(order).toContain('applied:notes/a.md')
    })
    expect(order).toEqual(['apply:notes/a.md', 'applied:notes/a.md'])
  })

  it('drops malformed payloads instead of applying them', async () => {
    const calls: string[] = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { emitChanges } = fakeBridge(async (command) => {
        calls.push(command)
        return null
      })
      await subscribeIndexChanges(1)
      emitChanges({ not: 'an array' })
      emitChanges([{ path: 1, kind: 'upsert' }])
      await Promise.resolve()
      expect(calls).toEqual([])
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })
})

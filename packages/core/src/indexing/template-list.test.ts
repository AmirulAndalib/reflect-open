import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { listTemplates } from './template-list'

// A fake bridge resolves `db_query` so the test exercises the real compiled
// SQL — the same harness the other indexing query tests use.
const mockInvoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>()

beforeEach(() => {
  mockInvoke.mockReset()
  setBridge({ invoke: mockInvoke, listen: async () => () => {} })
})

afterEach(() => {
  setBridge(null)
})

describe('listTemplates', () => {
  it('selects template-kind rows A→Z by folded title', async () => {
    mockInvoke.mockResolvedValue([
      { path: 'templates/journal.md', title: 'Journal', mtime: 1 },
      { path: 'templates/person.md', title: 'Person', mtime: 2 },
    ])

    const templates = await listTemplates()

    expect(templates).toEqual([
      { path: 'templates/journal.md', title: 'Journal', mtime: 1 },
      { path: 'templates/person.md', title: 'Person', mtime: 2 },
    ])
    const [command, args] = mockInvoke.mock.calls[0]!
    expect(command).toBe('db_query')
    const sql = String(args['sql'])
    expect(sql).toContain('"kind" = ?')
    expect(sql).toContain('order by "title_key"')
    expect(args['params']).toEqual(['template'])
  })
})

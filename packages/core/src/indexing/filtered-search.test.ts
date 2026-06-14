import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { parseSearchQuery } from './filter-query'
import { searchWithFilters } from './filtered-search'

const mockInvoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>()

beforeEach(() => {
  mockInvoke.mockReset()
  setBridge({ invoke: mockInvoke, listen: async () => () => {} })
})

afterEach(() => {
  setBridge(null)
})

describe('searchWithFilters', () => {
  it('starts tag-only recall searches from the folded tag key', async () => {
    mockInvoke.mockResolvedValueOnce([
      { path: 'notes/work.md', title: 'Work', daily_date: null },
    ])

    const hits = await searchWithFilters(parseSearchQuery('#Work'), 12)

    expect(hits).toEqual([
      { path: 'notes/work.md', title: 'Work', dailyDate: null, snippet: null },
    ])

    const [command, args] = mockInvoke.mock.calls[0]
    expect(command).toBe('db_query')
    const sql = String(args.sql)
    expect(sql).toContain('from "tags"')
    expect(sql).toContain('inner join "notes"')
    expect(sql).toContain('"tags"."tag_key"')
    expect(sql).not.toContain('search_fts')
    expect(sql).not.toContain('lower(')
    expect(args.params).toEqual(['work', 12])
  })
})

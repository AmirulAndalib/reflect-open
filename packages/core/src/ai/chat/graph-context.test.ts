import { describe, expect, it } from 'vitest'
import type { GraphStatsOptions } from '../../indexing/graph-stats'
import { loadChatGraphContext, MAX_CONTEXT_TAGS } from './graph-context'

describe('loadChatGraphContext', () => {
  it('loads stats at the prompt tag cap and stamps the graph name on them', async () => {
    const seen: GraphStatsOptions[] = []
    const context = await loadChatGraphContext('atlas-graph', {
      loadGraphStatsFn: async (options) => {
        seen.push(options)
        return {
          noteCount: 7,
          dailyNoteCount: 2,
          earliestDailyDate: '2026-06-01',
          latestDailyDate: '2026-06-10',
          tags: [{ tag: 'book', count: 2 }],
          tagsTruncated: false,
        }
      },
    })

    expect(seen).toEqual([{ tagLimit: MAX_CONTEXT_TAGS }])
    expect(context).toEqual({
      graphName: 'atlas-graph',
      noteCount: 7,
      dailyNoteCount: 2,
      earliestDailyDate: '2026-06-01',
      latestDailyDate: '2026-06-10',
      tags: [{ tag: 'book', count: 2 }],
      tagsTruncated: false,
    })
  })
})

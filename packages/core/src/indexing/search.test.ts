import { describe, expect, it } from 'vitest'
import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  highlightSearchText,
  parseHighlights,
} from './search'

const mark = (text: string): string => `${HIGHLIGHT_START}${text}${HIGHLIGHT_END}`

describe('parseHighlights', () => {
  it('splits a snippet into plain and highlighted runs', () => {
    expect(parseHighlights(`…notes about ${mark('rust')} and ${mark('sqlite')} here`)).toEqual([
      { text: '…notes about ', highlighted: false },
      { text: 'rust', highlighted: true },
      { text: ' and ', highlighted: false },
      { text: 'sqlite', highlighted: true },
      { text: ' here', highlighted: false },
    ])
  })

  it('handles snippets with no matches and empty input', () => {
    expect(parseHighlights('plain text')).toEqual([{ text: 'plain text', highlighted: false }])
    expect(parseHighlights('')).toEqual([])
  })

  it('handles a snippet that is one whole match', () => {
    expect(parseHighlights(mark('everything'))).toEqual([
      { text: 'everything', highlighted: true },
    ])
  })
})

describe('highlightSearchText', () => {
  it('highlights a contiguous multi-term match without changing its casing', () => {
    expect(highlightSearchText('Tim MacCaw', 'tim mac')).toEqual([
      { text: 'Tim Mac', highlighted: true },
      { text: 'Caw', highlighted: false },
    ])
  })

  it('falls back to highlighting separate query terms', () => {
    expect(highlightSearchText('MacCaw, Tim', 'tim mac')).toEqual([
      { text: 'Mac', highlighted: true },
      { text: 'Caw, ', highlighted: false },
      { text: 'Tim', highlighted: true },
    ])
  })

  it('returns plain text when the query is blank or has no title match', () => {
    expect(highlightSearchText('Project notes', '')).toEqual([
      { text: 'Project notes', highlighted: false },
    ])
    expect(highlightSearchText('Project notes', 'roadmap')).toEqual([
      { text: 'Project notes', highlighted: false },
    ])
  })
})

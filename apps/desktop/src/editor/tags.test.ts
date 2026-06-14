import type { EditorState } from '@prosekit/pm/state'
import type { EditorView } from '@prosekit/pm/view'
import { describe, expect, it, vi } from 'vitest'
import { createMeowdownEditor } from './meowdown'
import { computeTagRanges, createTagPlugin, defineTags } from './tags'

function stateFor(markdown: string): EditorState {
  return createMeowdownEditor(markdown, defineTags({ onNavigate: () => {} })).state
}

function tagsFor(markdown: string): string[] {
  return computeTagRanges(stateFor(markdown)).map((range) => range.tag)
}

describe('computeTagRanges', () => {
  it('finds tags that match the note index grammar', () => {
    expect(tagsFor('Read #book and #project/reflect-v2 today.')).toEqual([
      'book',
      'project/reflect-v2',
    ])
  })

  it('ignores invalid tag-looking text', () => {
    expect(tagsFor('#123 nope, a#middle nope, ##heading nope, #-dash nope')).toEqual([])
  })

  it('ignores tags inside code spans and code blocks', () => {
    expect(tagsFor('Real #book, code `#secret`.\n\n```\n#hidden\n```')).toEqual(['book'])
  })
})

describe('tag click navigation', () => {
  function tagClickEvent(tag: string): MouseEvent {
    const span = document.createElement('span')
    span.className = 'reflect-tag-link'
    span.setAttribute('data-tag', tag)
    const event = new MouseEvent('click')
    Object.defineProperty(event, 'target', { value: span })
    return event
  }

  it('navigates when clicking a rendered tag', () => {
    const onNavigate = vi.fn()
    const plugin = createTagPlugin({ onNavigate })
    const handled = plugin.props.handleClick!.call(
      plugin,
      { state: stateFor('See #book') } as unknown as EditorView,
      5,
      tagClickEvent('book'),
    )

    expect(handled).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('book')
  })
})

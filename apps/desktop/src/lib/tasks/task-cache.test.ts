import { type OpenTask } from '@reflect/core'
import { describe, expect, it } from 'vitest'
import { asCompleted, taskRawWithContent, withEditedTask, withoutTasks } from './task-cache'

function task(overrides: Partial<OpenTask> = {}): OpenTask {
  const text = overrides.text ?? 'do it'
  return {
    notePath: 'notes/n.md',
    markerOffset: 2,
    raw: `[ ] ${text}`,
    checked: false,
    text,
    noteTitle: 'N',
    dueDate: null,
    dailyDate: null,
    isPinned: false,
    pinnedOrder: null,
    updatedAt: 0,
    ...overrides,
  }
}

const a = task({ markerOffset: 1, text: 'a' })
const b = task({ markerOffset: 2, text: 'b' })
const c = task({ markerOffset: 3, text: 'c' })

describe('withoutTasks', () => {
  it('drops every matching row and keeps the rest', () => {
    expect(withoutTasks([a, b, c], [a, c])).toEqual([b])
  })

  it('leaves an undefined (not-loaded) list untouched', () => {
    expect(withoutTasks(undefined, [a])).toBeUndefined()
  })
})

describe('asCompleted', () => {
  it('prepends the tasks as checked, de-duping any already present', () => {
    const existingChecked = { ...b, checked: true }
    const result = asCompleted([existingChecked], [a, b])
    expect(result).toEqual([
      { ...a, checked: true },
      { ...b, checked: true },
    ])
  })

  it('is a no-op when the completed list is not loaded', () => {
    expect(asCompleted(undefined, [a])).toBeUndefined()
  })
})

describe('taskRawWithContent', () => {
  it('keeps an open marker', () => {
    expect(taskRawWithContent(task({ checked: false }), 'buy oat milk')).toBe('[ ] buy oat milk')
  })

  it('keeps a checked marker', () => {
    expect(taskRawWithContent(task({ checked: true }), 'really done')).toBe('[x] really done')
  })

  it('clears to a bare marker when content is empty', () => {
    expect(taskRawWithContent(task({ checked: false }), '')).toBe('[ ]')
  })
})

describe('withEditedTask', () => {
  it('rewrites the matching row’s text and raw, leaving others', () => {
    expect(withEditedTask([a, b], b, 'edited')).toEqual([a, { ...b, raw: '[ ] edited', text: 'edited' }])
  })

  it('leaves an undefined list untouched', () => {
    expect(withEditedTask(undefined, a, 'x')).toBeUndefined()
  })
})

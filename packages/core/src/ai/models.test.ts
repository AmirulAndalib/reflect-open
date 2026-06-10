import { describe, expect, it } from 'vitest'
import type { AiModelConfig } from '../settings/schema'
import {
  apiKeyHint,
  defaultAiModel,
  withAiModelAdded,
  withAiModelRemoved,
  withDefaultAiModel,
} from './models'

function config(overrides: Partial<AiModelConfig>): AiModelConfig {
  return {
    id: 'id',
    provider: 'openai',
    model: 'gpt-5.1',
    keyHint: 'hint1',
    isDefault: false,
    ...overrides,
  }
}

describe('apiKeyHint', () => {
  it('keeps only the trailing characters of a key', () => {
    expect(apiKeyHint('sk-ant-api03-secret-wxyz1')).toBe('wxyz1')
  })

  it('never exposes more than the key itself', () => {
    expect(apiKeyHint('abc')).toBe('abc')
  })
})

describe('withAiModelAdded', () => {
  it('makes the first entry the default even when not requested', () => {
    const added = withAiModelAdded([], config({ id: 'a', isDefault: false }))
    expect(added).toEqual([config({ id: 'a', isDefault: true })])
  })

  it('appends a non-default entry without touching the default', () => {
    const existing = [config({ id: 'a', isDefault: true })]
    const added = withAiModelAdded(existing, config({ id: 'b' }))
    expect(added.map((model) => [model.id, model.isDefault])).toEqual([
      ['a', true],
      ['b', false],
    ])
  })

  it('an entry added as default demotes the previous default', () => {
    const existing = [config({ id: 'a', isDefault: true })]
    const added = withAiModelAdded(existing, config({ id: 'b', isDefault: true }))
    expect(added.map((model) => [model.id, model.isDefault])).toEqual([
      ['a', false],
      ['b', true],
    ])
  })
})

describe('withAiModelRemoved', () => {
  it('removes the entry with the id', () => {
    const models = [config({ id: 'a', isDefault: true }), config({ id: 'b' })]
    expect(withAiModelRemoved(models, 'b')).toEqual([config({ id: 'a', isDefault: true })])
  })

  it('promotes the first remaining entry when the default is removed', () => {
    const models = [config({ id: 'a', isDefault: true }), config({ id: 'b' })]
    expect(withAiModelRemoved(models, 'a')).toEqual([config({ id: 'b', isDefault: true })])
  })

  it('removing the last entry yields the empty list', () => {
    expect(withAiModelRemoved([config({ id: 'a', isDefault: true })], 'a')).toEqual([])
  })
})

describe('withDefaultAiModel', () => {
  it('moves the default flag to the chosen entry', () => {
    const models = [config({ id: 'a', isDefault: true }), config({ id: 'b' })]
    expect(withDefaultAiModel(models, 'b').map((model) => [model.id, model.isDefault])).toEqual([
      ['a', false],
      ['b', true],
    ])
  })
})

describe('defaultAiModel', () => {
  it('returns the flagged entry', () => {
    const models = [config({ id: 'a' }), config({ id: 'b', isDefault: true })]
    expect(defaultAiModel(models)?.id).toBe('b')
  })

  it('falls back to the first entry when no flag survived', () => {
    const models = [config({ id: 'a' }), config({ id: 'b' })]
    expect(defaultAiModel(models)?.id).toBe('a')
  })

  it('returns null for the empty list', () => {
    expect(defaultAiModel([])).toBeNull()
  })
})

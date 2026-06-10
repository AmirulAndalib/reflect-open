import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setBridge, settingsSchema, type AiModelConfig } from '@reflect/core'
import { SettingsProvider } from '@/providers/settings-provider'
import { resetOperations } from '@/lib/operations'
import { AiModelsSection } from './ai-models-section'

let stored: Record<string, unknown>
let saved: unknown[]
let secrets: Map<string, string>
let failSecretSet: boolean

function installFakeBridge(): void {
  saved = []
  secrets = new Map()
  failSecretSet = false
  setBridge({
    invoke: async (command, args) => {
      switch (command) {
        case 'settings_load':
          return stored
        case 'settings_save':
          saved.push(args.settings)
          return null
        case 'secret_set':
          if (failSecretSet) {
            throw { kind: 'io', message: 'keychain locked' }
          }
          secrets.set(args.name as string, args.value as string)
          return null
        case 'secret_delete':
          secrets.delete(args.name as string)
          return null
        default:
          return null
      }
    },
    listen: async () => () => {},
  })
}

let queryClient: QueryClient

function renderSection(): void {
  render(
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <AiModelsSection />
      </SettingsProvider>
    </QueryClientProvider>,
  )
}

/** The aiModels list of the most recently persisted document. */
function lastSavedModels(): AiModelConfig[] {
  return settingsSchema.parse(saved.at(-1)).aiModels
}

function entry(overrides: Partial<AiModelConfig>): AiModelConfig {
  return {
    id: 'id',
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    keyHint: 'wxyz1',
    isDefault: false,
    ...overrides,
  }
}

beforeEach(() => {
  stored = {}
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  installFakeBridge()
})

afterEach(() => {
  cleanup()
  setBridge(null)
  queryClient.clear()
  resetOperations()
})

describe('AiModelsSection', () => {
  it('lists configured models with their key hint and default badge', async () => {
    stored = {
      aiModels: [
        entry({ id: 'a', isDefault: true }),
        entry({ id: 'b', provider: 'openai', model: 'gpt-5.1', keyHint: 'abcd2' }),
      ],
    }
    renderSection()

    await waitFor(() =>
      expect(screen.getByText('Anthropic — Claude Opus 4.8')).toBeTruthy(),
    )
    expect(screen.getByText('OpenAI — GPT-5.1')).toBeTruthy()
    expect(screen.getByText(/wxyz1/)).toBeTruthy()
    expect(screen.getByText(/abcd2/)).toBeTruthy()
    expect(screen.getByText('Default')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Make default' })).toBeTruthy()
  })

  it('adds a model: key goes to the keychain, entry (with hint) to settings', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText(/No AI models configured/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /add model/i }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add AI model' }))

    fireEvent.change(dialog.getByLabelText('Provider'), { target: { value: 'anthropic' } })
    fireEvent.change(dialog.getByLabelText('Model'), {
      target: { value: 'claude-sonnet-4-6' },
    })
    fireEvent.change(dialog.getByLabelText('API key'), {
      target: { value: 'sk-ant-test-wxyz1' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Add model' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    const [added] = lastSavedModels()
    expect(added).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      keyHint: 'wxyz1',
      isDefault: true, // the first entry is always the default
    })
    // The full key reached the keychain (and only the keychain).
    expect(secrets.get(`ai-api-key:${added.id}`)).toBe('sk-ant-test-wxyz1')
    expect(JSON.stringify(saved)).not.toContain('sk-ant-test-wxyz1')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a failed keychain write keeps the dialog open and persists nothing', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText(/No AI models configured/)).toBeTruthy())
    failSecretSet = true

    fireEvent.click(screen.getByRole('button', { name: /add model/i }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add AI model' }))
    fireEvent.change(dialog.getByLabelText('API key'), { target: { value: 'sk-test' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Add model' }))

    await waitFor(() => expect(dialog.getByRole('alert').textContent).toBe('keychain locked'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(saved).toEqual([])
    expect(secrets.size).toBe(0)
  })

  it('removes a model, deletes its secret, and promotes the next default', async () => {
    stored = {
      aiModels: [
        entry({ id: 'a', isDefault: true }),
        entry({ id: 'b', provider: 'openai', model: 'gpt-5.1', keyHint: 'abcd2' }),
      ],
    }
    secrets.set('ai-api-key:a', 'sk-a')
    renderSection()
    await waitFor(() =>
      expect(screen.getByText('Anthropic — Claude Opus 4.8')).toBeTruthy(),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Anthropic — Claude Opus 4.8' }),
    )

    await waitFor(() =>
      expect(lastSavedModels()).toEqual([
        entry({ id: 'b', provider: 'openai', model: 'gpt-5.1', keyHint: 'abcd2', isDefault: true }),
      ]),
    )
    expect(secrets.has('ai-api-key:a')).toBe(false)
  })

  it('make default moves the flag', async () => {
    stored = {
      aiModels: [
        entry({ id: 'a', isDefault: true }),
        entry({ id: 'b', provider: 'openai', model: 'gpt-5.1', keyHint: 'abcd2' }),
      ],
    }
    renderSection()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Make default' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Make default' }))

    await waitFor(() =>
      expect(lastSavedModels().map((model) => [model.id, model.isDefault])).toEqual([
        ['a', false],
        ['b', true],
      ]),
    )
  })
})

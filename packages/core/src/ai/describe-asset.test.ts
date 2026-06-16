import { describe, expect, it, vi } from 'vitest'
import { APICallError } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import type { LanguageModelV3CallOptions, LanguageModelV3Usage } from '@ai-sdk/provider'
import type { AiProviderConfig } from '../settings/schema'
import { describeAsset, isAssetDescriptionRejected } from './describe-asset'
import { languageModel } from './language-model'

vi.mock('./language-model', () => ({
  languageModel: vi.fn(),
}))

const languageModelMock = vi.mocked(languageModel)

const USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

const CONFIG: AiProviderConfig = {
  id: 'cfg-openai',
  provider: 'openai',
  model: 'gpt-5.5',
  keyHint: 'wxyz1',
}

function modelAnswering(text: string): LanguageModelV3CallOptions[] {
  const calls: LanguageModelV3CallOptions[] = []
  languageModelMock.mockReturnValue(
    new MockLanguageModelV3({
      doGenerate: async (options) => {
        calls.push(options)
        return {
          content: [{ type: 'text', text }],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage: USAGE,
          warnings: [],
        }
      },
    }),
  )
  return calls
}

function modelThrowing(error: unknown): void {
  languageModelMock.mockReturnValue(
    new MockLanguageModelV3({
      doGenerate: async () => {
        throw error
      },
    }),
  )
}

function apiError(statusCode: number): APICallError {
  return new APICallError({
    message: `provider answered ${statusCode}`,
    url: 'https://api.openai.com/v1/responses',
    requestBodyValues: {},
    statusCode,
  })
}

function request(overrides: Partial<Parameters<typeof describeAsset>[0]> = {}) {
  return describeAsset({
    config: CONFIG,
    apiKey: 'sk-live-key',
    path: 'assets/photo.png',
    contentsBase64: 'aGVsbG8=',
    mediaType: 'image/png',
    ...overrides,
  })
}

describe('describeAsset', () => {
  it('sends images as image parts and returns trimmed markdown', async () => {
    const calls = modelAnswering('  **Description**\n\nText.  ')

    await expect(request()).resolves.toBe('**Description**\n\nText.')

    const parts = calls[0]!.prompt[0]!.content as Array<{
      type: string
      mediaType?: string
      image?: string
      text?: string
    }>
    expect(parts[0]?.type).toBe('text')
    expect(parts[0]?.text).toContain('assets/photo.png')
    expect(parts[1]).toMatchObject({
      type: 'file',
      mediaType: 'image/png',
    })
  })

  it('sends PDFs as file parts with a filename', async () => {
    const calls = modelAnswering('A PDF summary.')

    await request({ path: 'assets/report.pdf', mediaType: 'application/pdf' })

    const parts = calls[0]!.prompt[0]!.content as Array<{
      type: string
      mediaType?: string
      filename?: string
    }>
    expect(parts[1]).toMatchObject({
      type: 'file',
      mediaType: 'application/pdf',
      filename: 'report.pdf',
    })
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
  ])('a %d from the provider throws an auth error', async (status, kind) => {
    modelThrowing(apiError(status))
    await expect(request()).rejects.toMatchObject({ kind })
  })

  it.each([
    [429, 'network'],
    [500, 'network'],
  ])('a %d from the provider throws a network error', async (status, kind) => {
    modelThrowing(apiError(status))
    await expect(request()).rejects.toMatchObject({ kind })
  })

  it('a 4xx provider refusal becomes AssetDescriptionRejectedError', async () => {
    modelThrowing(apiError(413))
    const failure = await request().catch((cause: unknown) => cause)
    expect(isAssetDescriptionRejected(failure)).toBe(true)
  })
})

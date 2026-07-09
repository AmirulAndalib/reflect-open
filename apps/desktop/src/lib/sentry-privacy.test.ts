import { describe, expect, it } from 'vitest'
import { dropSentryBreadcrumb, scrubSentryEventForPrivacy } from './sentry-privacy'

describe('Sentry privacy scrubber', () => {
  it('drops free-form event fields that could contain note content', () => {
    const scrubbed = scrubSentryEventForPrivacy({
      type: undefined,
      message: 'secret note text',
      logentry: { message: 'secret note text' },
      release: 'reflect@1.0.0',
      environment: 'production',
      request: { url: 'tauri://localhost/notes/secret-note?body=secret' },
      breadcrumbs: [{ message: 'secret note text', category: 'console' }],
      extra: { markdown: 'secret note text' },
      user: { email: 'person@example.com' },
      transaction: 'notes/secret-note',
      tags: { note: 'secret-note' },
      fingerprint: ['secret-note'],
      server_name: 'Alexs-MacBook',
      contexts: {
        app: { app_name: 'Reflect' },
        device: { model: 'Mac' },
        os: { name: 'macOS' },
        culture: { locale: 'en-GB' },
        trace: { span_id: '0123456789abcdef', trace_id: '0123456789abcdef0123456789abcdef' },
        note: { markdown: 'secret note text' },
      },
      sdkProcessingMetadata: { note: 'secret note text' },
      debug_meta: {
        images: [
          {
            type: 'sourcemap',
            code_file: 'tauri://localhost/assets/index.js?note=secret-note#selection',
            debug_id: '11111111-1111-4111-8111-111111111111',
          },
          {
            type: 'sourcemap',
            code_file: 'notes/secret-note.md',
            debug_id: '22222222-2222-4222-8222-222222222222',
          },
        ],
      },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'secret note text',
            module: 'notes.secret-note',
            mechanism: {
              type: 'react',
              handled: true,
              data: { componentStack: 'secret note text' },
            },
            stacktrace: {
              frames: [
                {
                  filename: 'assets/index.js?note=secret-note#selection',
                  function: 'renderEditor',
                  module: 'Users.alex.reflect-open.editor',
                  abs_path: '/Users/alex/notes/secret-note/assets/index.js',
                  lineno: 10,
                  colno: 4,
                  context_line: 'const note = "secret note text"',
                  pre_context: ['secret note text'],
                  post_context: ['secret note text'],
                  vars: { note: 'secret note text' },
                  module_metadata: { note: 'secret note text' },
                },
              ],
            },
          },
        ],
      },
    })

    expect(scrubbed.release).toBe('reflect@1.0.0')
    expect(scrubbed.environment).toBe('production')
    expect(scrubbed.message).toBeUndefined()
    expect(scrubbed.logentry).toBeUndefined()
    expect(scrubbed.request).toBeUndefined()
    expect(scrubbed.breadcrumbs).toBeUndefined()
    expect(scrubbed.extra).toBeUndefined()
    expect(scrubbed.user).toBeUndefined()
    expect(scrubbed.transaction).toBeUndefined()
    expect(scrubbed.tags).toBeUndefined()
    expect(scrubbed.fingerprint).toBeUndefined()
    expect(scrubbed.server_name).toBeUndefined()
    expect(scrubbed.contexts).toBeUndefined()
    expect(scrubbed.sdkProcessingMetadata).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.type).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.value).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.module).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.mechanism).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe('assets/index.js')
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.abs_path).toBe('app:///assets/index.js')
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.module).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.function).toBe('renderEditor')
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.context_line).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.pre_context).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.post_context).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.module_metadata).toBeUndefined()
    expect(scrubbed.debug_meta?.images).toEqual([
      {
        type: 'sourcemap',
        code_file: 'tauri://localhost/assets/index.js',
        debug_id: '11111111-1111-4111-8111-111111111111',
      },
    ])
  })

  it('keeps Sentry source map asset paths while removing URL payloads', () => {
    const scrubbed = scrubSentryEventForPrivacy({
      type: undefined,
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: 'tauri://localhost/assets/index-abc123.js?note=secret#text',
                  abs_path: 'http://localhost:1420/assets/index-abc123.js?note=secret#text',
                },
              ],
            },
          },
        ],
      },
    })

    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe(
      'tauri://localhost/assets/index-abc123.js',
    )
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.abs_path).toBe(
      'http://localhost:1420/assets/index-abc123.js',
    )
  })

  it('drops unknown stack frame paths instead of guessing whether they are safe', () => {
    const scrubbed = scrubSentryEventForPrivacy({
      type: undefined,
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: 'notes/secret-note.md',
                  abs_path: 'reflect://graph/notes/secret-note.md',
                },
                {
                  filename: 'app:///notes/secret-note.md',
                  abs_path: 'http://localhost:1420/notes/secret-note.md',
                },
              ],
            },
          },
        ],
      },
    })

    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.abs_path).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[1]?.filename).toBeUndefined()
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[1]?.abs_path).toBeUndefined()
  })

  it('drops every breadcrumb before it can be attached to an event', () => {
    expect(dropSentryBreadcrumb({ message: 'secret note text', category: 'console' })).toBeNull()
  })
})

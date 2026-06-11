import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@reflect/core'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { GithubAuthStep } from './github-auth-step'

// The device flow is unconfigured in OSS builds (no app client id), so the
// step renders the PAT path — exactly what these tests exercise. The keychain
// is the bridge fake; GET /user (instant token validation) goes through the
// mocked Tauri HTTP plugin.

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
const httpFetch = vi.mocked(tauriFetch)

afterEach(() => {
  cleanup()
  setBridge(null)
  httpFetch.mockReset()
})

function fakeKeychain(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  setBridge({
    invoke: async (command, args) => {
      const name = args.name as string
      if (command === 'secret_get') {
        return store.get(name) ?? null
      }
      if (command === 'secret_set') {
        store.set(name, args.value as string)
        return null
      }
      if (command === 'secret_delete') {
        store.delete(name)
        return null
      }
      throw new Error(`unexpected command ${command}`)
    },
    listen: async () => () => {},
  })
  return store
}

function githubAccepts(login: string): void {
  httpFetch.mockResolvedValue(
    new Response(JSON.stringify({ login }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function githubRejects(): void {
  httpFetch.mockResolvedValue(
    new Response(JSON.stringify({ message: 'Bad credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

describe('GithubAuthStep', () => {
  it('skips itself when a stored credential is still valid, reporting who', async () => {
    fakeKeychain({ 'github-auth': JSON.stringify({ kind: 'pat', token: 'ghp_abc' }) })
    githubAccepts('alex')
    const onAuthed = vi.fn()
    render(<GithubAuthStep onAuthed={onAuthed} />)

    await waitFor(() =>
      expect(onAuthed).toHaveBeenCalledWith({ login: 'alex', avatarUrl: null }),
    )
  })

  it('stores a pasted PAT, verifies it against GitHub, and reports the identity', async () => {
    const store = fakeKeychain()
    githubAccepts('alex')
    const onAuthed = vi.fn()
    render(<GithubAuthStep onAuthed={onAuthed} />)

    fireEvent.change(screen.getByLabelText('Personal access token'), {
      target: { value: '  github_pat_abc  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }))

    await waitFor(() =>
      expect(onAuthed).toHaveBeenCalledWith({ login: 'alex', avatarUrl: null }),
    )
    expect(JSON.parse(store.get('github-auth') ?? '{}')).toEqual({
      kind: 'pat',
      token: 'github_pat_abc',
    })
  })

  it('fails a rejected token at entry and clears it from the keychain', async () => {
    // The whole point of verifying here: a mistyped token must fail in this
    // step, not minutes later at the first sync — and must not stay stored
    // where every later flow would silently skip past sign-in with it.
    const store = fakeKeychain()
    githubRejects()
    const onAuthed = vi.fn()
    render(<GithubAuthStep onAuthed={onAuthed} />)

    fireEvent.change(screen.getByLabelText('Personal access token'), {
      target: { value: 'github_pat_typo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }))

    expect(await screen.findByText(/rejected the token/i)).toBeTruthy()
    expect(onAuthed).not.toHaveBeenCalled()
    expect(store.has('github-auth')).toBe(false)
  })

  it('rejects an empty token with an inline message', async () => {
    fakeKeychain()
    const onAuthed = vi.fn()
    render(<GithubAuthStep onAuthed={onAuthed} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save token' }))

    expect(await screen.findByText('Paste a token first.')).toBeTruthy()
    expect(onAuthed).not.toHaveBeenCalled()
  })

  it('names the backup repository in the token instructions when known', async () => {
    fakeKeychain()
    render(<GithubAuthStep onAuthed={vi.fn()} repoName="my-notes-backup" />)

    expect(await screen.findByText('my-notes-backup')).toBeTruthy()
  })
})

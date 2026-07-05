import { z } from 'zod'
import { ReflectError } from '../errors'
import { apiHeaders, readJson, type FetchFn } from './github-api'

export interface GithubRepoRef {
  owner: string
  name: string
}

/** The description stamped on backup repos we create or prefill. */
export const BACKUP_REPO_DESCRIPTION = 'Reflect notes backup'

/**
 * The prefilled github.com/new URL — the universal "create the repo on the
 * user's behalf" path. `POST /user/repos` only works with classic PATs and
 * OAuth tokens, **not** fine-grained PATs.
 */
export function newRepoUrl(name: string): string {
  const params = new URLSearchParams({
    name,
    visibility: 'private',
    description: BACKUP_REPO_DESCRIPTION,
  })
  return `https://github.com/new?${params.toString()}`
}

/** Parse `https://github.com/owner/repo(.git)` → ref, or `null` for any other remote. */
export function parseGithubRemote(url: string): GithubRepoRef | null {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url)
  if (match === null) {
    return null
  }
  return { owner: match[1]!, name: match[2]! }
}

/** The canonical HTTPS remote URL for a repo (token never embedded). */
export function githubRemoteUrl(ref: GithubRepoRef): string {
  return `https://github.com/${ref.owner}/${ref.name}.git`
}

export interface GithubRepo {
  fullName: string
  /** Backups must default private; a public repo needs explicit confirmation. */
  isPrivate: boolean
  defaultBranch: string
  htmlUrl: string
}

const repoResponseSchema = z.object({
  full_name: z.string(),
  private: z.boolean(),
  default_branch: z.string(),
  html_url: z.string(),
})

function toRepo(parsed: z.infer<typeof repoResponseSchema>): GithubRepo {
  return {
    fullName: parsed.full_name,
    isPrivate: parsed.private,
    defaultBranch: parsed.default_branch,
    htmlUrl: parsed.html_url,
  }
}

/**
 * Create a repo for the signed-in user (private by default — the backup
 * norm). Returns `null` when the token *type* cannot create repositories.
 */
export async function createGithubRepo(
  token: string,
  name: string,
  options: { isPrivate?: boolean; fetchFn?: FetchFn } = {},
): Promise<GithubRepo | null> {
  const fetchFn = options.fetchFn ?? fetch
  const response = await fetchFn('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      private: options.isPrivate ?? true,
      description: BACKUP_REPO_DESCRIPTION,
      auto_init: false,
    }),
  })
  if (response.status === 403) {
    const body = (await response.text()).toLowerCase()
    if (body.includes('not accessible')) {
      return null
    }
    throw new ReflectError('auth', 'GitHub rejected the token (403)')
  }
  if (response.status === 401) {
    throw new ReflectError('auth', 'GitHub rejected the token (401)')
  }
  if (!response.ok) {
    const body = await response.text()
    throw new ReflectError('io', `creating the repo failed (${response.status}): ${body}`)
  }
  return toRepo(await readJson(response, repoResponseSchema, 'repo creation'))
}

/** Look up a repo (visibility check before connecting); `null` when missing. */
export async function getGithubRepo(
  token: string,
  ref: GithubRepoRef,
  fetchFn: FetchFn = fetch,
): Promise<GithubRepo | null> {
  const response = await fetchFn(`https://api.github.com/repos/${ref.owner}/${ref.name}`, {
    headers: apiHeaders(token),
  })
  if (response.status === 404) {
    return null
  }
  if (response.status === 401 || response.status === 403) {
    throw new ReflectError('auth', `GitHub rejected the token (${response.status})`)
  }
  if (!response.ok) {
    throw new ReflectError('io', `looking up the repo failed (${response.status})`)
  }
  return toRepo(await readJson(response, repoResponseSchema, 'repo lookup'))
}

import {
  clearGithubAuth,
  getAuthenticatedUser,
  getGithubToken,
  isAppError,
  type GithubUser,
} from '@reflect/core'
import { providerFetch } from '@/lib/provider-fetch'

/**
 * The machine-level GitHub identity (not graph-scoped, unlike the backup
 * controller): resolves the stored credential to who it belongs to via
 * `GET /user`. Doubles as token validation — the connect flow calls this
 * right after a credential is stored so a mistyped token fails at entry
 * ("GitHub rejected the token") instead of minutes later at the first sync.
 *
 * Returns `null` when no credential is stored. A credential GitHub rejects
 * is **cleared** before the auth error is rethrown — keeping it would make
 * every later flow skip the sign-in step and fail somewhere worse.
 */
export async function fetchSignedInUser(): Promise<GithubUser | null> {
  const token = await getGithubToken(providerFetch)
  if (token === null) {
    return null
  }
  try {
    return await getAuthenticatedUser(token, providerFetch)
  } catch (error: unknown) {
    if (isAppError(error) && error.kind === 'auth') {
      await clearGithubAuth()
    }
    throw error
  }
}

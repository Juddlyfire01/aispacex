// Server-side session helper: resolve a currently-valid X access token from the
// request cookies, transparently refreshing it when it has expired (or is about
// to). Returns the token plus any Set-Cookie headers the caller must forward so
// the refreshed token is persisted back to the browser.
//
// Multi-account model: each connected X account stores its own token triplet in
// `x_access_token__<id>` / `x_refresh_token__<id>` / `x_token_expiry__<id>`.
// `x_active_account` selects which one the proxy uses. Legacy single-account
// cookies (no suffix) are honored as a fallback so existing users keep working
// until they re-connect, at which point the callback stamps per-account cookies.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  COOKIE, readEnv, refreshAccessToken, parseCookies, serializeCookie, clearCookie,
  cookiesAreSecure,
  accessCookieName, refreshCookieName, expiryCookieName,
  clearAccountCookies, parseAccountLabels,
} from './x-oauth.js'

// Refresh a bit early so in-flight requests never race the expiry boundary.
const REFRESH_SKEW_MS = 60_000

export interface ResolvedSession {
  accountId: string
  accessToken: string
  setCookies: string[] // forward via res.setHeader('Set-Cookie', …)
}

/** Returns a valid access token for the active account, or null if not connected. */
export async function resolveSession(req: VercelRequest): Promise<ResolvedSession | null> {
  const cookies = parseCookies(req.headers.cookie)

  // 1. Multi-account path: an active account is selected and its cookies exist.
  const activeId = cookies[COOKIE.activeAccount]
  if (activeId) {
    const resolved = await resolveAccount(req, activeId, cookies)
    if (resolved) return resolved
    // Active cookie pointed at a missing/stale account — fall through to legacy.
  }

  // 2. Legacy single-account fallback (pre-multi-account users).
  const legacy = await resolveLegacy(req, cookies)
  if (legacy) return legacy

  return null
}

async function resolveAccount(
  req: VercelRequest,
  accountId: string,
  cookies: Record<string, string>,
): Promise<ResolvedSession | null> {
  const access = cookies[accessCookieName(accountId)]
  const refresh = cookies[refreshCookieName(accountId)]
  const expiry = Number(cookies[expiryCookieName(accountId)] ?? 0)

  const stillValid = access && expiry && Date.now() < expiry - REFRESH_SKEW_MS
  if (stillValid) return { accountId, accessToken: access, setCookies: [] }
  if (!refresh) return null // can't refresh this account → treat as not connected

  const env = readEnv(req)
  let token
  try {
    token = await refreshAccessToken(env, refresh)
  } catch {
    return null
  }
  const secure = cookiesAreSecure(req)
  const setCookies = [
    serializeCookie(accessCookieName(accountId), token.access_token, { maxAge: token.expires_in, secure }),
    serializeCookie(expiryCookieName(accountId), String(Date.now() + token.expires_in * 1000), { maxAge: 60 * 60 * 24 * 30, secure }),
  ]
  if (token.refresh_token) {
    setCookies.push(serializeCookie(refreshCookieName(accountId), token.refresh_token, { maxAge: 60 * 60 * 24 * 60, secure }))
  }
  return { accountId, accessToken: token.access_token, setCookies }
}

async function resolveLegacy(
  req: VercelRequest,
  cookies: Record<string, string>,
): Promise<ResolvedSession | null> {
  const access = cookies[COOKIE.access]
  const refresh = cookies[COOKIE.refresh]
  const expiry = Number(cookies[COOKIE.expiry] ?? 0)

  const stillValid = access && expiry && Date.now() < expiry - REFRESH_SKEW_MS
  if (stillValid) return { accountId: 'legacy', accessToken: access, setCookies: [] }
  if (!refresh) return null

  const env = readEnv(req)
  let token
  try {
    token = await refreshAccessToken(env, refresh)
  } catch {
    return null
  }
  const expiryMs = Date.now() + token.expires_in * 1000
  const secure = cookiesAreSecure(req)
  const setCookies = [
    serializeCookie(COOKIE.access, token.access_token, { maxAge: token.expires_in, secure }),
    serializeCookie(COOKIE.expiry, String(expiryMs), { maxAge: 60 * 60 * 24 * 30, secure }),
  ]
  if (token.refresh_token) {
    setCookies.push(serializeCookie(COOKIE.refresh, token.refresh_token, { maxAge: 60 * 60 * 24 * 60, secure }))
  }
  return { accountId: 'legacy', accessToken: token.access_token, setCookies }
}

/** List every connected account from `x_account__<id>` cookies. */
export function listAccounts(req: VercelRequest): { id: string; username: string }[] {
  return parseAccountLabels(req.headers.cookie)
}

/** Clear every auth cookie (logout-all). Use clearAccount for a single account. */
export function clearSessionCookies(res: VercelResponse) {
  res.setHeader('Set-Cookie', [
    clearCookie(COOKIE.access),
    clearCookie(COOKIE.refresh),
    clearCookie(COOKIE.expiry),
    clearCookie(COOKIE.activeAccount),
  ])
}

/** Clear one account's cookies. If it was the active one, also clears the
 *  active marker so the caller (or a subsequent re-probe) picks a successor. */
export function clearAccountSessionCookies(res: VercelResponse, accountId: string, wasActive: boolean) {
  const cookies = clearAccountCookies(accountId)
  if (wasActive) cookies.push(clearCookie(COOKIE.activeAccount))
  res.setHeader('Set-Cookie', cookies)
}

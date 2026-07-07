// GET /api/x/oauth/callback?code=...&state=...
// X redirects here after the user consents. We verify the CSRF state, exchange
// the code for tokens using the stored PKCE verifier, look up the connected
// user's X id + username (so we can stamp per-account cookies), persist the
// tokens in HttpOnly cookies keyed by that id, mark the new account active,
// clear the transient cookies, and bounce the user back into the app.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  X_API_BASE, COOKIE, readEnv, exchangeCode, parseCookies, serializeCookie, clearCookie,
  cookiesAreSecure, unpackOAuthState,
  serializeAccountCookies,
} from '../../_lib/x-oauth.js'

interface MeResponse {
  data?: { id: string; username: string }
  errors?: { detail?: string }[]
}

async function fetchMe(accessToken: string): Promise<{ id: string; username: string }> {
  const res = await fetch(`${X_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const json = (await res.json().catch(() => ({}))) as MeResponse
  if (!json.data) throw new Error(json.errors?.[0]?.detail ?? 'Could not resolve X user id')
  return json.data
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const env = readEnv(req)
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const error = typeof req.query.error === 'string' ? req.query.error : ''

    if (error) return bounce(res, env.appBaseUrl, `x_error=${encodeURIComponent(error)}`)
    if (!code || !state) return bounce(res, env.appBaseUrl, 'x_error=missing_code')

    // Prefer signed state (survives cross-site redirect without cookies). Fall back
    // to legacy PKCE cookies for in-flight logins started before deploy.
    const cookies = parseCookies(req.headers.cookie)
    let verifier = unpackOAuthState(state)
    if (!verifier && cookies[COOKIE.state] === state && cookies[COOKIE.verifier]) {
      verifier = cookies[COOKIE.verifier]
    }
    if (!verifier) return bounce(res, env.appBaseUrl, 'x_error=invalid_state')

    const token = await exchangeCode(env, code, verifier)
    const me = await fetchMe(token.access_token)
    const secure = cookiesAreSecure(req)

    const cookieHeaders = [
      // Per-account cookies for this newly connected account.
      ...serializeAccountCookies(me.id, token, me.username, secure),
      // Mark it the active account.
      serializeCookie(COOKIE.activeAccount, me.id, { maxAge: 60 * 60 * 24 * 60, secure }),
      // Clear the one-shot PKCE cookies.
      clearCookie(COOKIE.verifier),
      clearCookie(COOKIE.state),
      // Clear any legacy single-account cookies (the per-account set supersedes).
      clearCookie(COOKIE.access),
      clearCookie(COOKIE.refresh),
      clearCookie(COOKIE.expiry),
    ]

    res.setHeader('Set-Cookie', cookieHeaders)
    // Echo the account id so the frontend can immediately reconcile without a
    // separate session probe.
    return bounce(res, env.appBaseUrl, `x_connected=${encodeURIComponent(me.id)}`)
  } catch (e) {
    const env = safeEnv()
    return bounce(res, env, `x_error=${encodeURIComponent(e instanceof Error ? e.message : 'callback_failed')}`)
  }
}

function safeEnv(): string {
  return process.env.APP_BASE_URL || '/'
}

function bounce(res: VercelResponse, base: string, query: string) {
  const sep = base.includes('?') ? '&' : '?'
  res.setHeader('Location', `${base}${sep}${query}`)
  res.status(302).end()
}

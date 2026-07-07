// Shared helpers for the X (Twitter) OAuth 2.0 Authorization Code + PKCE flow.
// Used by the /api/x/oauth/* serverless functions. Everything here is
// server-side only — secrets and tokens must never reach the browser bundle.
import crypto from 'node:crypto'

export const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize'
export const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
export const X_API_BASE = 'https://api.x.com/2'

// Scopes we request. offline.access is required to receive a refresh_token so
// the 2-hour access token can be renewed without bouncing the user through
// consent again. tweet.write enables the Compose tab to publish posts/threads;
// the rest are read scopes for the Profile/Targets tabs. Adding a scope forces
// existing users to re-consent once on their next connect.
export const X_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'bookmark.read',
  'like.read',
  'offline.access',
] as const

// Cookie names. All are HttpOnly so client JS can never read the token/verifier.
//
// Multi-account model: each connected X account gets its own cookie triplet
// suffixed with `__<accountId>` (e.g. x_access_token__17000000). A separate
// `x_active_account` cookie records which account the proxy should use.
//
// Legacy single-account cookies (x_access_token, x_refresh_token, x_token_expiry)
// are kept only as a fallback so existing users keep working until they
// re-connect, at which point the callback stamps per-account cookies.
export const COOKIE = {
  // Transient PKCE cookies (login round-trip only).
  verifier: 'x_pkce_verifier',
  state: 'x_oauth_state',
  // Legacy single-account cookies (fallback only).
  access: 'x_access_token',
  refresh: 'x_refresh_token',
  expiry: 'x_token_expiry', // epoch ms when the access token expires
  // Multi-account cookies.
  activeAccount: 'x_active_account', // holds the active X account id
  accountLabel: 'x_account',          // x_account__<id> = username (HttpOnly)
} as const

/** Per-account cookie name for the access token: `x_access_token__<id>`. */
export function accessCookieName(accountId: string): string {
  return `${COOKIE.access}__${accountId}`
}
/** Per-account cookie name for the refresh token: `x_refresh_token__<id>`. */
export function refreshCookieName(accountId: string): string {
  return `${COOKIE.refresh}__${accountId}`
}
/** Per-account cookie name for the token expiry: `x_token_expiry__<id>`. */
export function expiryCookieName(accountId: string): string {
  return `${COOKIE.expiry}__${accountId}`
}
/** Per-account cookie name for the username label: `x_account__<id>`. */
export function accountLabelCookieName(accountId: string): string {
  return `${COOKIE.accountLabel}__${accountId}`
}

/** Set-Cookie headers that record one connected account's tokens + label. */
export function serializeAccountCookies(
  accountId: string,
  token: { access_token: string; refresh_token?: string; expires_in: number },
  username: string,
  secure: boolean,
): string[] {
  const expiryMs = Date.now() + token.expires_in * 1000
  const out = [
    serializeCookie(accessCookieName(accountId), token.access_token, { maxAge: token.expires_in, secure }),
    serializeCookie(expiryCookieName(accountId), String(expiryMs), { maxAge: 60 * 60 * 24 * 30, secure }),
    serializeCookie(accountLabelCookieName(accountId), username, { maxAge: 60 * 60 * 24 * 60, secure }),
  ]
  if (token.refresh_token) {
    out.push(serializeCookie(refreshCookieName(accountId), token.refresh_token, { maxAge: 60 * 60 * 24 * 60, secure }))
  }
  return out
}

/** Set-Cookie headers that expire one account's cookies + label. */
export function clearAccountCookies(accountId: string): string[] {
  return [
    clearCookie(accessCookieName(accountId)),
    clearCookie(refreshCookieName(accountId)),
    clearCookie(expiryCookieName(accountId)),
    clearCookie(accountLabelCookieName(accountId)),
  ]
}

/** Parse `x_account__<id>=<username>` cookies into a list of known accounts. */
export function parseAccountLabels(cookieHeader: string | undefined): { id: string; username: string }[] {
  const cookies = parseCookies(cookieHeader)
  const prefix = `${COOKIE.accountLabel}__`
  const out: { id: string; username: string }[] = []
  for (const [name, username] of Object.entries(cookies)) {
    if (name.startsWith(prefix) && username) {
      out.push({ id: name.slice(prefix.length), username })
    }
  }
  return out
}

export interface XOAuthEnv {
  clientId: string
  clientSecret: string | null // null → public client (PKCE only)
  redirectUri: string
  appBaseUrl: string // where to send the user after callback
}

/** Minimal request shape for deriving the browser origin during OAuth. */
export type OAuthRequest = { headers?: Record<string, string | string[] | undefined> }

function headerFirst(headers: OAuthRequest['headers'], name: string): string | undefined {
  const v = headers?.[name]
  if (Array.isArray(v)) return v[0]
  return typeof v === 'string' ? v : undefined
}

function inferProto(headers: OAuthRequest['headers'], host: string): string {
  const forwarded = headerFirst(headers, 'x-forwarded-proto')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return 'http'
  return 'https'
}

/**
 * OAuth redirect + post-login URLs must match the origin the user is actually
 * browsing. Static env vars cannot work across Vite :5173, vercel dev :3000,
 * production, and every Vercel preview hostname — cookies are origin-scoped
 * and X requires an exact redirect_uri match.
 */
export function resolveOAuthOrigin(req?: OAuthRequest): { redirectUri: string; appBaseUrl: string } {
  if (process.env.X_OAUTH_USE_ENV_URLS === 'true' && process.env.X_REDIRECT_URI) {
    return {
      redirectUri: process.env.X_REDIRECT_URI,
      appBaseUrl: process.env.APP_BASE_URL || '/',
    }
  }

  const host = headerFirst(req?.headers, 'x-forwarded-host') ?? headerFirst(req?.headers, 'host')
  if (host) {
    const cleanHost = host.split(',')[0]!.trim()
    const origin = `${inferProto(req?.headers, cleanHost)}://${cleanHost}`
    return {
      redirectUri: `${origin}/api/x/oauth/callback`,
      appBaseUrl: `${origin}/`,
    }
  }

  if (process.env.X_REDIRECT_URI) {
    return {
      redirectUri: process.env.X_REDIRECT_URI,
      appBaseUrl: process.env.APP_BASE_URL || '/',
    }
  }

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    const origin = vercelUrl.startsWith('http')
      ? vercelUrl.replace(/\/$/, '')
      : `https://${vercelUrl.replace(/\/$/, '')}`
    return {
      redirectUri: `${origin}/api/x/oauth/callback`,
      appBaseUrl: `${origin}/`,
    }
  }

  throw new Error(
    'Could not resolve OAuth origin — browse the app over HTTP(S), or set X_REDIRECT_URI',
  )
}

/** Whether auth cookies should use the Secure flag for this request. */
export function cookiesAreSecure(req?: OAuthRequest): boolean {
  const host = headerFirst(req?.headers, 'x-forwarded-host') ?? headerFirst(req?.headers, 'host')
  if (!host) return process.env.VERCEL_ENV === 'production'
  return inferProto(req?.headers, host.split(',')[0]!.trim()) === 'https'
}

/** Read + validate OAuth env. Pass the incoming request on login/callback routes. */
export function readEnv(req?: OAuthRequest): XOAuthEnv {
  const clientId = process.env.X_CLIENT_ID
  if (!clientId) {
    const vercelEnv = process.env.VERCEL_ENV
    if (vercelEnv === 'preview' || vercelEnv === 'development') {
      throw new Error(
        'X_CLIENT_ID is not set for this Vercel environment. In Vercel → Project Settings → Environment Variables, add X_CLIENT_ID (and X_CLIENT_SECRET if required) with Preview enabled, then redeploy.',
      )
    }
    throw new Error('X_CLIENT_ID is not set')
  }
  const { redirectUri, appBaseUrl } = resolveOAuthOrigin(req)
  return {
    clientId,
    clientSecret: process.env.X_CLIENT_SECRET || null,
    redirectUri,
    appBaseUrl,
  }
}

// ——— PKCE ———

export function randomUrlToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function codeChallengeS256(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// ——— Signed OAuth state (PKCE without round-trip cookies) ———
//
// Browsers often drop the short-lived PKCE cookies on the cross-site hop
// (app → x.com → callback), which caused state_mismatch and “connect twice”
// behaviour on preview/first try. We embed the verifier in a signed `state`
// param instead so the callback only needs the query string X returns.

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

function oauthStateSecret(): string {
  return process.env.X_CLIENT_SECRET || process.env.X_CLIENT_ID || 'oauth-state'
}

/** Build the `state` query param: HMAC-signed verifier + expiry. */
export function packOAuthState(verifier: string): string {
  const payload = JSON.stringify({
    v: verifier,
    e: Date.now() + OAUTH_STATE_TTL_MS,
    n: randomUrlToken(8),
  })
  const sig = crypto.createHmac('sha256', oauthStateSecret()).update(payload).digest('base64url')
  return Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url')
}

/** Recover the PKCE verifier from `state`, or null if invalid/expired. */
export function unpackOAuthState(state: string): string | null {
  try {
    const { p, s } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
      p: string
      s: string
    }
    const expected = crypto.createHmac('sha256', oauthStateSecret()).update(p).digest('base64url')
    if (s !== expected) return null
    const { v, e } = JSON.parse(p) as { v: string; e: number }
    if (!v || Date.now() > e) return null
    return v
  } catch {
    return null
  }
}

// ——— Cookies ———

export interface CookieOpts {
  maxAge?: number // seconds
  httpOnly?: boolean
  path?: string
  /** Default true. Set false for http://localhost responses. */
  secure?: boolean
}

export function serializeCookie(name: string, value: string, opts: CookieOpts = {}): string {
  const parts = [`${name}=${value}`]
  parts.push(`Path=${opts.path ?? '/'}`)
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.httpOnly !== false) parts.push('HttpOnly')
  if (opts.secure !== false) parts.push('Secure')
  parts.push('SameSite=Lax')
  return parts.join('; ')
}

/** Expire a cookie by name (Max-Age=0). */
export function clearCookie(name: string): string {
  return serializeCookie(name, '', { maxAge: 0 })
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

// ——— Token endpoint ———

export interface XTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number // seconds
  scope?: string
  token_type: string
}

/** Build the Authorization header for the token endpoint when using a
 *  confidential client (client secret present). Public clients omit this. */
function basicAuthHeader(env: XOAuthEnv): Record<string, string> {
  if (!env.clientSecret) return {}
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')
  return { Authorization: `Basic ${basic}` }
}

export async function exchangeCode(env: XOAuthEnv, code: string, verifier: string): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.redirectUri,
    code_verifier: verifier,
    client_id: env.clientId,
  })
  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...basicAuthHeader(env) },
    body,
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<XTokenResponse>
}

export async function refreshAccessToken(env: XOAuthEnv, refreshToken: string): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: env.clientId,
  })
  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...basicAuthHeader(env) },
    body,
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<XTokenResponse>
}

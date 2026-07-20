// App-only bearer reads for public X profile gather — never user OAuth.
// Used by /api/x/demo (legacy route name) as a read-only allowlisted proxy.
import { X_API_BASE } from './x-oauth.js'

export const DEMO_USERNAME = 'AskVenice'

let cachedDemoUserId: string | null = null

export function readAppBearerToken(): string | null {
  const token = process.env.X_BEARER_TOKEN?.trim()
  return token || null
}

/** @deprecated Prefer resolvePublic reads; kept for AskVenice seeding / tests. */
export async function resolveDemoUserId(bearer: string): Promise<string> {
  if (cachedDemoUserId) return cachedDemoUserId
  const url = `${X_API_BASE}/users/by/username/${encodeURIComponent(DEMO_USERNAME)}?user.fields=id`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`demo_user_lookup_failed:${res.status}:${text.slice(0, 200)}`)
  }
  const body = (await res.json()) as { data?: { id?: string } }
  const id = body.data?.id
  if (!id) throw new Error('demo_user_lookup_missing_id')
  cachedDemoUserId = id
  return id
}

// Public read allowlist for gather (arbitrary accounts). No writes, DMs, or
// user-context-only endpoints (bookmarks, likes, /users/me).
const BY_USERNAME = /^users\/by\/username\/[A-Za-z0-9_]{1,15}$/i
const USER_BY_ID = /^users\/\d+$/
const USER_TIMELINE = /^users\/\d+\/(tweets|mentions|affiliates)$/
const TWEETS_BY_IDS = /^tweets$/

/**
 * True when the X API sub-path is an allowed public read for app-bearer gather.
 * `demoUserId` is unused (kept for call-site compatibility with older handlers).
 */
export function isDemoPathAllowed(path: string, _demoUserId?: string): boolean {
  return isPublicReadPathAllowed(path)
}

/** True when the X API sub-path is allowed for app-only bearer public gather. */
export function isPublicReadPathAllowed(path: string): boolean {
  const clean = path.replace(/^\/+/, '')
  if (BY_USERNAME.test(clean)) return true
  if (USER_BY_ID.test(clean)) return true
  if (USER_TIMELINE.test(clean)) return true
  if (TWEETS_BY_IDS.test(clean)) return true
  return false
}

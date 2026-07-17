// Gratis demo reads for @AskVenice only — app-only bearer, never user OAuth.
import { X_API_BASE } from './x-oauth.js'

export const DEMO_USERNAME = 'AskVenice'

let cachedDemoUserId: string | null = null

export function readAppBearerToken(): string | null {
  const token = process.env.X_BEARER_TOKEN?.trim()
  return token || null
}

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

const BY_USERNAME = /^users\/by\/username\/AskVenice$/i
const USER_TIMELINE = /^users\/(\d+)\/(tweets|mentions)$/
// Affiliates roster for the demo org itself (gratis @AskVenice affiliates list).
const USER_AFFILIATES = /^users\/(\d+)\/affiliates$/

/** True when the X API sub-path is allowed for the hard-coded demo account. */
export function isDemoPathAllowed(path: string, demoUserId: string): boolean {
  if (BY_USERNAME.test(path)) return true
  const timeline = path.match(USER_TIMELINE)
  if (timeline && timeline[1] === demoUserId) return true
  const affiliates = path.match(USER_AFFILIATES)
  return Boolean(affiliates && affiliates[1] === demoUserId)
}

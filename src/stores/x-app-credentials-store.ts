import { create } from 'zustand'

const SESSION_KEY = 'x-app-credentials'

export interface XAppCredentials {
  clientId: string
  clientSecret: string
  bearer: string
}

interface XAppCredentialsState extends XAppCredentials {
  setCredentials: (creds: Partial<XAppCredentials>) => void
  clearCredentials: () => void
  hasAny: () => boolean
}

function readSession(): XAppCredentials {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return { clientId: '', clientSecret: '', bearer: '' }
    const parsed = JSON.parse(raw) as Partial<XAppCredentials>
    return {
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
      clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : '',
      bearer: typeof parsed.bearer === 'string' ? parsed.bearer : '',
    }
  } catch {
    return { clientId: '', clientSecret: '', bearer: '' }
  }
}

function writeSession(creds: XAppCredentials): void {
  try {
    if (!creds.clientId && !creds.clientSecret && !creds.bearer) {
      sessionStorage.removeItem(SESSION_KEY)
      return
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(creds))
  } catch { /* private mode */ }
}

const initial = typeof sessionStorage !== 'undefined'
  ? readSession()
  : { clientId: '', clientSecret: '', bearer: '' }

export const useXAppCredentialsStore = create<XAppCredentialsState>()((set, get) => ({
  ...initial,

  setCredentials: (patch) => {
    const next = {
      clientId: patch.clientId ?? get().clientId,
      clientSecret: patch.clientSecret ?? get().clientSecret,
      bearer: patch.bearer ?? get().bearer,
    }
    writeSession(next)
    set(next)
  },

  clearCredentials: () => {
    const empty = { clientId: '', clientSecret: '', bearer: '' }
    writeSession(empty)
    set(empty)
  },

  hasAny: () => {
    const s = get()
    return Boolean(s.clientId.trim() || s.clientSecret.trim() || s.bearer.trim())
  },
}))

/** Push current store credentials to HttpOnly cookies (or clear them). */
export async function syncXByokCookies(): Promise<{ ok: boolean; error?: string }> {
  const { clientId, clientSecret, bearer } = useXAppCredentialsStore.getState()
  const hasAny = Boolean(clientId.trim() || clientSecret.trim() || bearer.trim())
  try {
    if (!hasAny) {
      const res = await fetch('/api/x/byok', { method: 'DELETE', credentials: 'same-origin' })
      if (!res.ok) return { ok: false, error: 'Could not clear X app credentials' }
      return { ok: true }
    }
    const res = await fetch('/api/x/byok', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientId.trim() || undefined,
        clientSecret: clientSecret.trim() || undefined,
        bearer: bearer.trim() || undefined,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      return { ok: false, error: body.error ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

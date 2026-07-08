// Client for the OAuth-connected user's OWN X data ("Profile" tab).
//
// Unlike x-client.ts (app-only bearer token, target analysis), this path uses
// the user-context OAuth session held server-side in HttpOnly cookies. The
// browser never sees the token: every call goes through our /api/x/proxy/*
// serverless function, which attaches the token and forwards to the X API.
//
// Multi-account: the server stamps one cookie triplet per connected X account
// and a single x_active_account cookie selects which one the proxy uses.
// switchActiveAccount POSTs to /api/x/active to flip that cookie; subsequent
// proxy calls hit the newly-active account.
//
// In dev there are no serverless functions, so the Vite proxy forwards /api to
// `vercel dev` (see vite.config.ts). Requests always include credentials so the
// auth cookies ride along.
import { XAPIError } from './x-client'
import { useXSelfStore } from '../../stores/x-self-store'
import { useXIntelStore } from '../../stores/x-intel-store'

export const X_OAUTH_INTEL_TAB_KEY = 'x_oauth_intel_top_tab'
export const X_OAUTH_LOGIN_PATH = '/api/x/oauth/login'

const PROXY_BASE = '/api/x/proxy'

export interface SelfAccountRef {
  id: string
  username: string
}

export interface SelfSession {
  connected: boolean
  accountId?: string
  username?: string
  accounts: SelfAccountRef[]
}

/** Whether the user has a live OAuth session, plus the full account list. */
export async function getSelfSession(): Promise<SelfSession> {
  try {
    const res = await fetch('/api/x/session', { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) return { connected: false, accounts: [] }
    return (await res.json()) as SelfSession
  } catch {
    return { connected: false, accounts: [] }
  }
}

/** Begin the OAuth login redirect. Flips the store into the connecting state
 *  and stashes a sessionStorage flag so the remounted app can keep showing the
 *  connecting UI until the session probe resolves. The redirect is deferred one
 *  paint frame (double rAF) so the connecting state actually renders before the
 *  browser navigates away. */
export function beginSelfLogin(): void {
  useXSelfStore.getState().setConnecting(true)
  try {
    sessionStorage.setItem('x_oauth_in_progress', '1')
    sessionStorage.setItem(X_OAUTH_INTEL_TAB_KEY, useXIntelStore.getState().activeTopTab)
  } catch { /* private mode / disabled */ }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.location.href = X_OAUTH_LOGIN_PATH
  }))
}

/** Switch the active X account server-side (sets x_active_account cookie). */
export async function switchActiveAccount(accountId: string): Promise<{ ok: boolean; username?: string }> {
  try {
    const res = await fetch(`/api/x/active?account=${encodeURIComponent(accountId)}`, {
      method: 'POST',
      credentials: 'same-origin',
    })
    if (!res.ok) return { ok: false }
    const json = (await res.json()) as { ok: boolean; username?: string }
    return { ok: json.ok, username: json.username }
  } catch {
    return { ok: false }
  }
}

/** Logout. With an accountId, disconnects only that one account; without it,
 *  clears everything (legacy logout-all). */
export async function selfLogout(accountId?: string): Promise<void> {
  try {
    const qs = accountId ? `?account=${encodeURIComponent(accountId)}` : ''
    await fetch(`/api/x/logout${qs}`, { method: 'POST', credentials: 'same-origin' })
  } catch { /* best-effort */ }
}

/** Authenticated GET against the connected user's X data via the server proxy. */
export async function selfApi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const clean = path.startsWith('/') ? path.slice(1) : path
  const res = await fetch(`${PROXY_BASE}/${clean}${qs ? `?${qs}` : ''}`, {
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = await res.json()
      message = err?.error || err?.detail || err?.errors?.[0]?.detail || err?.title || message
    } catch { /* keep default */ }
    throw new XAPIError(message, res.status)
  }
  return res.json() as Promise<T>
}

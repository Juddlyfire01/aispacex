// Base path for the authenticated X API proxy. All target reads route through
// the same server-side OAuth proxy the Profile tab uses: the browser sends no
// token, the serverless function attaches the user-context access token. This
// works identically in dev (Vite forwards /api to `vercel dev`) and in prod
// (the /api/x/proxy function), and it scales — each connected user draws on
// their own rate-limit allotment rather than one shared app-only bucket.
export const X_PROXY_BASE = '/api/x/proxy'

export class XAPIError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'XAPIError'
    this.status = status
  }
}

export async function xapi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const clean = path.startsWith('/') ? path.slice(1) : path
  const res = await fetch(`${X_PROXY_BASE}/${clean}${qs ? `?${qs}` : ''}`, {
    credentials: 'same-origin',
  })

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = await res.json()
      message = err?.error || err?.detail || err?.errors?.[0]?.detail || err?.title || message
    } catch { /* use default */ }
    throw new XAPIError(message, res.status)
  }

  return res.json() as Promise<T>
}

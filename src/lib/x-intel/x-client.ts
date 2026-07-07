// Base paths for X API proxies. Target reads use OAuth when connected, or the
// gratis @AskVenice demo path (app-only bearer) when not.
export const X_PROXY_BASE = '/api/x/proxy'
export const X_DEMO_BASE = '/api/x/demo'

export type GatherAuth = 'oauth' | 'demo'

const PROXY_BASE: Record<GatherAuth, string> = {
  oauth: X_PROXY_BASE,
  demo: X_DEMO_BASE,
}

const ERROR_HINTS: Record<string, string> = {
  x_not_connected: 'Connect your X account (header → Connect X).',
  x_demo_unconfigured: 'Demo profile loading is not configured on this deployment.',
  demo_path_forbidden: 'This action requires connecting your X account.',
}

export class XAPIError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'XAPIError'
    this.status = status
  }
}

function formatError(json: Record<string, unknown> | null, status: number): string {
  const code = typeof json?.error === 'string' ? json.error : ''
  if (code && ERROR_HINTS[code]) return ERROR_HINTS[code]
  const detail = json?.detail ?? json?.errors
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object' && detail[0] !== null && 'detail' in detail[0]) {
    return String((detail[0] as { detail?: string }).detail)
  }
  if (typeof json?.title === 'string') return json.title
  return `HTTP ${status}`
}

export async function xapi<T>(
  path: string,
  params: Record<string, string> = {},
  auth: GatherAuth = 'oauth',
): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const clean = path.startsWith('/') ? path.slice(1) : path
  const res = await fetch(`${PROXY_BASE[auth]}/${clean}${qs ? `?${qs}` : ''}`, {
    credentials: 'same-origin',
  })

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = (await res.json()) as Record<string, unknown>
      message = formatError(err, res.status)
    } catch { /* use default */ }
    throw new XAPIError(message, res.status)
  }

  return res.json() as Promise<T>
}

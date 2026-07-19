import type { VeniceErrorBody, VeniceDetailedError, VeniceContentViolationError } from '../types/venice'
import { useAuthStore } from '../stores/auth-store'
import { VENICE_SERVER_FRONTED } from './venice-config'

const ENV_BASE = (import.meta.env.VITE_VENICE_BASE_URL as string | undefined)?.replace(/\/$/, '')
// Server-fronted: always hit our /api/venice/proxy so the shared key is injected
// by vercel dev / Vercel Functions (same path in local dev and production).
// BYOK: Vite /venice proxy in dev (optional local key inject or pass-through),
// direct Venice API in production with the user's client key.
export const BASE_URL =
  ENV_BASE ||
  (VENICE_SERVER_FRONTED
    ? '/api/venice/proxy'
    : import.meta.env.DEV
      ? '/venice/api/v1'
      : 'https://api.venice.ai/api/v1')

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_RETRIES = 2

export class VeniceAPIError extends Error {
  status: number
  code?: string
  suggestedPrompt?: string
  issues?: string[]

  constructor(
    message: string,
    status: number,
    code?: string,
    suggestedPrompt?: string,
    issues?: string[],
  ) {
    super(message)
    this.name = 'VeniceAPIError'
    this.status = status
    this.code = code
    this.suggestedPrompt = suggestedPrompt
    this.issues = issues
  }
}

function getApiKey(): string {
  const key = useAuthStore.getState().apiKey
  if (!key) throw new VeniceAPIError('API key not set. Click "API Key" in the header to connect.', 401)
  return key
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function backoffDelay(attempt: number, retryAfter?: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter)
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 30_000)
  }
  // Exponential backoff with jitter: 500, 1000, 2000 ms (+/- 25%)
  const base = 500 * 2 ** attempt
  return base + Math.random() * base * 0.25
}

async function parseError(res: Response): Promise<VeniceAPIError> {
  let message = `HTTP ${res.status}`
  let code: string | undefined
  let suggestedPrompt: string | undefined
  let issues: string[] | undefined
  try {
    const body = (await res.json()) as VeniceErrorBody

    // Shape 1 — StandardError: { error: { message, type, code, suggested_prompt } }
    // Shape 2 — DetailedError: { error: "...", details, issues } (Zod validation 400s)
    // Shape 3 — ContentViolationError: { error: "...", suggested_prompt } (422)
    // `error` may be a string (shapes 2/3) or an object (shape 1).
    if (typeof body.error === 'string') {
      message = body.error
      // DetailedError — extract Zod issue messages
      const detailed = body as Partial<VeniceDetailedError>
      if (detailed.issues && Array.isArray(detailed.issues)) {
        issues = detailed.issues.map((i) => i.message).filter(Boolean)
      }
      // ContentViolationError — extract suggested_prompt
      const violation = body as Partial<VeniceContentViolationError>
      if (violation.suggested_prompt) suggestedPrompt = violation.suggested_prompt
    } else if (body.error && typeof body.error === 'object') {
      message = body.error.message ?? message
      code = body.error.code
      suggestedPrompt = body.error.suggested_prompt
    }
  } catch {
    /* keep default */
  }
  // Prefer actionable text over opaque defaults:
  // 1) Zod issues · 2) API code · 3) "Request rejected (status)" — never leave
  // bare "HTTP 400" as the only thing a user (or toast) sees.
  if (issues && issues.length > 0 && (message === 'Invalid request' || /^HTTP \d+$/.test(message))) {
    message = issues.join(' · ')
  } else if (/^HTTP \d+$/.test(message)) {
    message = code ?? `Request rejected (${res.status})`
  }
  return new VeniceAPIError(message, res.status, code, suggestedPrompt, issues)
}

interface VeniceFetchOptions extends RequestInit {
  stream?: boolean
  noAuth?: boolean
  retries?: number
}

export async function veniceFetch(path: string, options: VeniceFetchOptions): Promise<Response> {
  const { stream, noAuth, retries = MAX_RETRIES, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers)
  // When server-fronted, /api/venice/proxy injects the shared key — the browser
  // must not send one. Otherwise use the user's client key.
  if (!noAuth && !VENICE_SERVER_FRONTED) headers.set('Authorization', `Bearer ${getApiKey()}`)
  if (fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers })
      if (res.ok) return res

      // Don't retry client errors (auth, validation) or terminal failures
      if (!RETRY_STATUSES.has(res.status) || attempt === retries) throw await parseError(res)

      // Drain body so connection can be reused
      try { await res.arrayBuffer() } catch { /* noop */ }
      await sleep(backoffDelay(attempt, res.headers.get('Retry-After')))
      continue
    } catch (err) {
      lastErr = err
      // Network error: retry up to limit
      if (err instanceof VeniceAPIError) throw err
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (attempt === retries) break
      await sleep(backoffDelay(attempt))
    }
    void stream // suppress unused-var lint (kept for future per-call overrides)
  }
  throw lastErr instanceof Error ? lastErr : new VeniceAPIError('Network error', 0)
}

export async function venice<T>(path: string, options: VeniceFetchOptions = {}): Promise<T> {
  const res = await veniceFetch(path, options)
  if (options.stream) return res.body as unknown as T
  return res.json() as Promise<T>
}

export async function veniceFormData<T>(path: string, formData: FormData, init: { signal?: AbortSignal } = {}): Promise<T> {
  const res = await veniceFetch(path, {
    method: 'POST',
    body: formData,
    signal: init.signal,
  })
  return res.json() as Promise<T>
}

export async function veniceBlob(path: string, body: object, init: { signal?: AbortSignal } = {}): Promise<Blob> {
  const res = await veniceFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: init.signal,
  })
  return res.blob()
}

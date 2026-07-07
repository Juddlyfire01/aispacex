import type { VeniceChartPeriod, VeniceCharts, VeniceMetrics } from './types'
import type { BuzzItemType, BuzzMetrics, BuzzResponse, SocialMetrics } from './signal-types'

// Same path in dev and prod — Vite proxies to venicestats.com directly, or to
// `vercel dev` when VITE_API_TARGET is set (see vite.config.ts).
export const VENICESTATS_BASE = '/api/venicestats/proxy'

export class VeniceStatsError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'VeniceStatsError'
    this.status = status
  }
}

async function venicestatsGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${VENICESTATS_BASE}${path}`, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = body || res.statusText
    try {
      const parsed = JSON.parse(body) as { error?: string }
      if (parsed.error) message = parsed.error
    } catch { /* keep raw body */ }
    throw new VeniceStatsError(message, res.status)
  }
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new VeniceStatsError('VeniceStats returned a non-JSON response', res.status)
  }
}

export function fetchVeniceMetrics(): Promise<VeniceMetrics> {
  return venicestatsGet<VeniceMetrics>('/api/metrics')
}

export function fetchVeniceCharts(period: VeniceChartPeriod): Promise<VeniceCharts> {
  return venicestatsGet<VeniceCharts>('/api/charts', { period })
}

export function fetchBuzz(params?: { type?: BuzzItemType; limit?: number; offset?: number }): Promise<BuzzResponse> {
  const query: Record<string, string> = {}
  if (params?.type) query.type = params.type
  if (params?.limit != null) query.limit = String(params.limit)
  if (params?.offset != null) query.offset = String(params.offset)
  return venicestatsGet<BuzzResponse>('/api/buzz', query)
}

export function fetchBuzzMetrics(weeks: number): Promise<BuzzMetrics> {
  return venicestatsGet<BuzzMetrics>('/api/buzz/metrics', { weeks: String(weeks) })
}

export function fetchSocial(): Promise<SocialMetrics> {
  return venicestatsGet<SocialMetrics>('/api/social')
}

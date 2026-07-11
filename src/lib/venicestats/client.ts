import type { VeniceChartPeriod, VeniceCharts, VeniceMetrics } from './types'
import type { BuzzItemType, BuzzMetrics, BuzzResponse, SocialMetrics } from './signal-types'
import {
  buildStatsRequest,
  downsampleChartSeries,
  projectMetrics,
  type StatsDomain,
} from './paths'
import { fetchModelsBundle } from '../venice-model-utils'

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

async function venicestatsGet<T>(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(`${VENICESTATS_BASE}${path}`, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
    signal,
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

export async function fetchStatsAction(
  domain: StatsDomain,
  action: string,
  args: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
): Promise<unknown> {
  let req
  try {
    req = buildStatsRequest(domain, action, args)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  if (req.kind === 'unsupported') {
    return {
      error: `Action "${req.action}" is not available via the public VeniceStats REST API yet`,
      action: req.action,
      unsupported: true,
    }
  }

  if (req.kind === 'venice_models') {
    try {
      const bundle = await fetchModelsBundle(req.type)
      return {
        source: 'venice.ai /models',
        note: 'Model catalog from Venice public API; attribute VeniceStats.com when presenting in chat per product norms.',
        models: bundle.models.slice(0, typeof args.limit === 'number' ? args.limit : 20),
      }
    } catch (err) {
      if (err instanceof VeniceStatsError) {
        return { error: err.message, action, status: err.status }
      }
      return { error: err instanceof Error ? err.message : String(err), action }
    }
  }

  try {
    if (req.kind === 'metrics_project') {
      const metrics = await venicestatsGet<Record<string, unknown>>('/api/metrics', undefined, opts?.signal)
      return projectMetrics(
        metrics,
        req.projection,
        typeof args.category === 'string' ? args.category : undefined,
      )
    }

    const data = await venicestatsGet<unknown>(req.path, req.params, opts?.signal)
    if (action === 'charts' && data && typeof data === 'object') {
      return downsampleChartSeries(data as Record<string, unknown>)
    }
    if (action === 'trends' && data && typeof data === 'object') {
      const metric = typeof args.metric === 'string' ? args.metric : 'vvvPrice'
      const charts = data as Record<string, unknown>
      const series = charts[metric]
      return downsampleChartSeries(
        { period: charts.period, metric, series: Array.isArray(series) ? series : [] },
        80,
      )
    }
    return data
  } catch (err) {
    // Return structured error so compose tools don't crash the agent round
    if (err instanceof VeniceStatsError) {
      return { error: err.message, action, status: err.status }
    }
    return { error: err instanceof Error ? err.message : String(err), action }
  }
}

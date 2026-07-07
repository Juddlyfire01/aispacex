import { useQuery } from '@tanstack/react-query'
import { fetchBuzz, fetchBuzzMetrics, fetchSocial, fetchVeniceCharts, fetchVeniceMetrics } from '../lib/venicestats/client'
import type { VeniceChartPeriod } from '../lib/venicestats/types'
import type { BuzzItemType } from '../lib/venicestats/signal-types'

const METRICS_STALE = 60_000
const CHARTS_STALE = 5 * 60_000

export function useVeniceMetrics() {
  return useQuery({
    queryKey: ['venicestats', 'metrics'],
    queryFn: fetchVeniceMetrics,
    staleTime: METRICS_STALE,
    refetchInterval: METRICS_STALE,
  })
}

export function useVeniceCharts(period: VeniceChartPeriod) {
  return useQuery({
    queryKey: ['venicestats', 'charts', period],
    queryFn: () => fetchVeniceCharts(period),
    staleTime: CHARTS_STALE,
  })
}

export function useBuzz(type?: BuzzItemType, limit = 50) {
  return useQuery({
    queryKey: ['venicestats', 'buzz', type ?? 'all', limit],
    queryFn: () => fetchBuzz({ type, limit }),
    staleTime: METRICS_STALE,
    refetchInterval: METRICS_STALE,
  })
}

export function useBuzzMetrics(weeks = 52) {
  return useQuery({
    queryKey: ['venicestats', 'buzz-metrics', weeks],
    queryFn: () => fetchBuzzMetrics(weeks),
    staleTime: CHARTS_STALE,
  })
}

export function useSocial() {
  return useQuery({
    queryKey: ['venicestats', 'social'],
    queryFn: fetchSocial,
    staleTime: CHARTS_STALE,
  })
}

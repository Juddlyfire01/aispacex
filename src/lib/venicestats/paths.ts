// src/lib/venicestats/paths.ts

export type StatsDomain = 'protocol' | 'market' | 'social' | 'wallet'

export type MetricsProjection =
  | 'overview'
  | 'price'
  | 'staking'
  | 'free_float'
  | 'category' // used with category param

export type StatsRequest =
  | { kind: 'venicestats'; path: string; params?: Record<string, string> }
  | { kind: 'venice_models'; type: string }
  | { kind: 'unsupported'; action: string }
  | { kind: 'metrics_project'; projection: MetricsProjection }

const PRICE_KEYS = [
  'vvvPrice', 'vvvPriceChange1h', 'vvvPriceChange4h', 'priceChange24h', 'vvvPriceChange7d',
  'marketCap', 'fdv', 'circulatingSupply', 'totalSupply', 'ethPrice',
  'diemPrice', 'diemPriceChange1h', 'diemPriceChange4h', 'diemPriceChange24h', 'diemPriceChange7d',
  'diemMarketCap', 'diemFdv', 'priceLastUpdated', 'lastUpdated',
] as const

const STAKING_KEYS = [
  'totalStaked', 'stakingRatio', 'stakingRatioChange24h', 'svvvSupply', 'svvvLocked', 'svvvUnlocked',
  'lockRatio', 'stakerApr', 'stakingGrowth7d', 'stakingGrowth30d', 'netFlow7d', 'newStakers7dCount',
  'cooldownVvv', 'cooldownWallets', 'cooldownCount', 'emissionRate', 'emissionPerYear', 'lastUpdated',
] as const

const FREE_FLOAT_KEYS = [
  'freeFloatVvv', 'freeFloatVvvPctCirc', 'freeFloatVvvPctTotal',
  'freeFloatDiem', 'freeFloatDiemPct', 'circulatingSupply', 'totalSupply', 'lastUpdated',
] as const

const DIEM_KEYS = [
  'diemPrice', 'diemPriceChange1h', 'diemPriceChange4h', 'diemPriceChange24h', 'diemPriceChange7d',
  'diemMarketCap', 'diemFdv', 'diemSupply', 'diemStaked', 'diemStakeRatio',
  'mintRate', 'mintCostUsd', 'marketDiscount', 'diemBreakEvenDays', 'remainingMintable',
  'lastUpdated',
] as const

const BURNS_KEYS = [
  'burnedSupply', 'organicBurned', 'burnUsdValueAnnualized', 'burnRevenueAnnualized',
  'programmaticBurns', 'monthlyBurns', 'lastUpdated',
] as const

const ECONOMICS_KEYS = [
  'veniceRevenue', 'ecosystemTvl', 'mintCostUsd', 'marketDiscount', 'burnRevenueAnnualized',
  'burnUsdValueAnnualized', 'marketCap', 'fdv', 'diemMarketCap', 'diemFdv', 'lastUpdated',
] as const

const GROWTH_KEYS = [
  'stakingGrowth7d', 'stakingGrowth30d', 'netFlow7d', 'newStakers7dCount', 'activeWallets7dCount',
  'programmaticBurns', 'lastUpdated',
] as const

const VESTING_KEYS = [
  'vestingTotal', 'vestingUnlocked', 'vestingLocked', 'vestingDailyDrip', 'lastUpdated',
] as const

const CATEGORY_KEYS: Record<string, readonly string[]> = {
  token: PRICE_KEYS,
  staking: STAKING_KEYS,
  diem: DIEM_KEYS,
  burns: BURNS_KEYS,
  economics: ECONOMICS_KEYS,
  growth: GROWTH_KEYS,
  vesting: VESTING_KEYS,
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  return undefined
}

/** Coerce known arg keys into string query params (omit empty). */
function pickParams(
  args: Record<string, unknown>,
  keys: string[],
): Record<string, string> | undefined {
  const params: Record<string, string> = {}
  for (const k of keys) {
    if (!(k in args) || args[k] == null) continue
    const s = str(args[k])
    if (s !== undefined) {
      params[k] = s
      continue
    }
    const n = num(args[k])
    if (n !== undefined) {
      params[k] = String(n)
      continue
    }
    const b = bool(args[k])
    if (b !== undefined) {
      params[k] = b ? 'true' : 'false'
    }
  }
  return Object.keys(params).length > 0 ? params : undefined
}

function vs(path: string, params?: Record<string, string>): StatsRequest {
  return params ? { kind: 'venicestats', path, params } : { kind: 'venicestats', path }
}

function unknownAction(domain: StatsDomain, action: string): never {
  throw new Error(`Unknown action: ${domain}.${action}`)
}

export function buildStatsRequest(
  domain: StatsDomain,
  action: string,
  args: Record<string, unknown>,
): StatsRequest {
  switch (domain) {
    case 'protocol':
      switch (action) {
        case 'overview':
          return { kind: 'metrics_project', projection: 'overview' }
        case 'price':
          return { kind: 'metrics_project', projection: 'price' }
        case 'staking':
          return { kind: 'metrics_project', projection: 'staking' }
        case 'free_float':
          return { kind: 'metrics_project', projection: 'free_float' }
        case 'burns':
          return vs('/api/burns', pickParams(args, ['limit', 'offset']))
        case 'burns_timeline':
          return vs('/api/burns-timeline', pickParams(args, ['granularity', 'range']))
        case 'burn_stats_by_tier':
          return vs('/api/burn-stats-by-tier')
        case 'discretionary_burn':
          return vs('/api/discretionary-burn')
        case 'diem':
          return vs('/api/diem-analytics')
        case 'vesting':
          return vs('/api/vesting')
        case 'airdrop':
          return vs('/api/airdrop')
        case 'treasury': {
          const mode = str(args.mode) ?? 'overview'
          return vs('/api/treasury', { mode })
        }
        case 'simulate_revenue':
          return vs(
            '/api/simulate-revenue',
            pickParams(args, [
              'tierMix',
              'churn',
              'burnModel',
              'horizonMonths',
              'includeDiscretionary',
            ]),
          )
        case 'models':
          return { kind: 'venice_models', type: 'text' }
        default:
          return unknownAction(domain, action)
      }

    case 'market':
      switch (action) {
        case 'volume': {
          // Prefer KPI snapshot; fine volume series → /api/markets/volume
          const fineSeries =
            args.series === true ||
            args.fine === true ||
            args.volumeSeries === true ||
            str(args.series) === 'true' ||
            str(args.fine) === 'true'
          if (fineSeries) {
            return vs('/api/markets/volume', pickParams(args, ['period', 'token']))
          }
          return vs('/api/markets', pickParams(args, ['period', 'token']))
        }
        case 'large_trades':
          return vs('/api/markets/large-swaps', pickParams(args, ['limit']))
        case 'trends':
        case 'charts': {
          const period = str(args.period) ?? '30d'
          return vs('/api/charts', { period })
        }
        case 'benchmarks':
          return { kind: 'unsupported', action: 'benchmarks' }
        case 'insider_flow':
          return vs('/api/insider-flow')
        default:
          return unknownAction(domain, action)
      }

    case 'social':
      switch (action) {
        case 'buzz':
          return vs('/api/buzz', pickParams(args, ['type', 'limit', 'offset']))
        case 'buzz_metrics': {
          const weeks = num(args.weeks)
          return weeks != null
            ? vs('/api/buzz/metrics', { weeks: String(weeks) })
            : vs('/api/buzz/metrics')
        }
        case 'social':
          return vs('/api/social')
        case 'live':
          return vs('/api/live', pickParams(args, ['limit']))
        default:
          return unknownAction(domain, action)
      }

    case 'wallet':
      switch (action) {
        case 'wallet': {
          const address = str(args.address)
          return address
            ? vs('/api/venetians', { address })
            : vs('/api/venetians')
        }
        case 'wallet_trades':
          return vs('/api/wallet-swaps', pickParams(args, ['address', 'limit', 'offset']))
        case 'leaderboard': {
          const mode = str(args.mode)
          if (mode && /staking/i.test(mode)) {
            const params = pickParams(args, ['limit']) ?? {}
            params.mode = 'topStaking'
            return vs('/api/venetians', params)
          }
          return vs('/api/holders', pickParams(args, ['limit', 'page', 'sort']))
        }
        default:
          return unknownAction(domain, action)
      }

    default:
      return unknownAction(domain, action)
  }
}

export function projectMetrics(
  metrics: Record<string, unknown>,
  projection: MetricsProjection,
  category?: string,
): Record<string, unknown> {
  const pick = (keys: readonly string[]) => {
    const out: Record<string, unknown> = {}
    for (const k of keys) if (k in metrics) out[k] = metrics[k]
    return out
  }
  if (projection === 'price') return pick(PRICE_KEYS)
  if (projection === 'staking') return pick(STAKING_KEYS)
  if (projection === 'free_float') return pick(FREE_FLOAT_KEYS)
  if (projection === 'category' || (projection === 'overview' && category)) {
    const keys = category ? CATEGORY_KEYS[category] : undefined
    if (keys) return pick(keys)
    return { ...metrics }
  }
  // overview without category → full metrics copy
  return { ...metrics }
}

export function downsampleChartSeries(
  charts: Record<string, unknown>,
  maxPoints = 80,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...charts }
  let changed = false
  for (const [k, v] of Object.entries(charts)) {
    if (!Array.isArray(v) || v.length <= maxPoints) continue
    const step = Math.ceil(v.length / maxPoints)
    out[k] = v.filter((_, i) => i % step === 0).slice(0, maxPoints)
    changed = true
  }
  if (changed) out.downsampled = true
  return out
}

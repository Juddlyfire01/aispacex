import type { ToolDefinition } from '../../types/venice'
import { fetchStatsAction } from '../venicestats/client'
import type { StatsDomain } from '../venicestats/paths'

const TRUNCATE_CHARS = 32_000

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

const TOOL_DOMAIN: Record<string, StatsDomain> = {
  stats_protocol: 'protocol',
  stats_market: 'market',
  stats_social: 'social',
  stats_wallet: 'wallet',
}

export const COMPOSE_STATS_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'stats_protocol',
      description:
        'VeniceStats protocol metrics: price, staking, burns, DIEM, vesting, treasury, airdrop, free float, revenue simulation, and model catalog.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'overview',
              'price',
              'staking',
              'burns',
              'burns_timeline',
              'burn_stats_by_tier',
              'discretionary_burn',
              'free_float',
              'diem',
              'vesting',
              'airdrop',
              'treasury',
              'simulate_revenue',
              'models',
            ],
            description: 'Which protocol dataset to fetch.',
          },
          limit: { type: 'number', description: 'Max items (burns, models).' },
          offset: { type: 'number', description: 'Pagination offset (burns).' },
          granularity: { type: 'string', description: 'burns_timeline granularity.' },
          range: { type: 'string', description: 'burns_timeline range.' },
          mode: { type: 'string', description: 'treasury mode (default overview).' },
          category: { type: 'string', description: 'Optional overview category filter.' },
          tierMix: { type: 'string', description: 'simulate_revenue tier mix.' },
          churn: { type: 'number', description: 'simulate_revenue churn rate.' },
          burnModel: { type: 'string', description: 'simulate_revenue burn model.' },
          horizonMonths: { type: 'number', description: 'simulate_revenue horizon.' },
          includeDiscretionary: {
            type: 'boolean',
            description: 'simulate_revenue include discretionary burns.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stats_market',
      description:
        'VeniceStats market data: volume, large trades, price charts/trends, benchmarks, and insider flow.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['volume', 'large_trades', 'trends', 'charts', 'benchmarks', 'insider_flow'],
            description: 'Which market dataset to fetch.',
          },
          period: { type: 'string', description: 'Chart/volume period (e.g. 30d).' },
          metric: {
            type: 'string',
            description: 'Required for trends — chart series key (e.g. vvvPrice).',
          },
          limit: { type: 'number', description: 'Max items (large_trades).' },
          fine: { type: 'boolean', description: 'volume: fine series via /markets/volume.' },
          series: { type: 'boolean', description: 'volume: alias for fine series.' },
          volumeSeries: { type: 'boolean', description: 'volume: alias for fine series.' },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stats_social',
      description: 'VeniceStats social signal: buzz feed, buzz metrics, social KPIs, and live events.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['buzz', 'buzz_metrics', 'social', 'live'],
            description: 'Which social dataset to fetch.',
          },
          type: { type: 'string', description: 'buzz item type filter.' },
          limit: { type: 'number', description: 'Max items (buzz, live).' },
          offset: { type: 'number', description: 'Pagination offset (buzz).' },
          weeks: { type: 'number', description: 'buzz_metrics lookback weeks.' },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stats_wallet',
      description:
        'VeniceStats wallet tools: look up a wallet, its trades, or holder/staker leaderboards.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['wallet', 'wallet_trades', 'leaderboard'],
            description: 'Which wallet dataset to fetch.',
          },
          address: {
            type: 'string',
            description: 'EVM address (0x…40 hex). Required for wallet and wallet_trades.',
          },
          limit: { type: 'number', description: 'Max items.' },
          offset: { type: 'number', description: 'Pagination offset (wallet_trades).' },
          page: { type: 'number', description: 'Leaderboard page.' },
          mode: {
            type: 'string',
            description: 'leaderboard mode (e.g. topStaking for stakers).',
          },
          sort: { type: 'string', description: 'holders leaderboard sort.' },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
]

function maybeTruncate(result: unknown): unknown {
  let json: string
  try {
    json = JSON.stringify(result)
  } catch {
    return { error: 'Failed to serialize tool result' }
  }
  if (json.length <= TRUNCATE_CHARS) return result

  if (Array.isArray(result)) {
    let slice = result
    while (slice.length > 0 && JSON.stringify(slice).length > TRUNCATE_CHARS) {
      slice = slice.slice(0, Math.max(1, Math.floor(slice.length / 2)))
      if (slice.length === 1 && JSON.stringify(slice).length > TRUNCATE_CHARS) {
        return { truncated: true, data: [], note: 'Result too large even after shrinking' }
      }
    }
    return { truncated: true, data: slice }
  }

  if (result && typeof result === 'object') {
    const obj = { ...(result as Record<string, unknown>) }
    let changed = false
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (Array.isArray(val)) {
        let arr = val
        while (arr.length > 0 && JSON.stringify({ ...obj, [key]: arr }).length > TRUNCATE_CHARS) {
          arr = arr.slice(0, Math.max(1, Math.floor(arr.length / 2)))
          if (arr.length === 1 && JSON.stringify({ ...obj, [key]: arr }).length > TRUNCATE_CHARS) {
            arr = []
            break
          }
        }
        if (arr.length !== val.length) {
          obj[key] = arr
          changed = true
        }
      }
    }
    if (changed) {
      obj.truncated = true
      return obj
    }
    return { truncated: true, data: obj }
  }

  return { truncated: true, data: result }
}

/**
 * Execute one compose VeniceStats domain tool via fetchStatsAction.
 * Unknown tools and thrown errors become `{ error: string }`.
 */
export async function executeStatsTool(
  name: string,
  args: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
): Promise<unknown> {
  try {
    const domain = TOOL_DOMAIN[name]
    if (!domain) {
      return { error: `Unknown tool: ${name}` }
    }

    const action = typeof args?.action === 'string' && args.action.length > 0 ? args.action : undefined
    if (!action) {
      return { error: 'action is required' }
    }

    if (action === 'wallet' || action === 'wallet_trades') {
      const address = typeof args.address === 'string' ? args.address : ''
      if (!ADDRESS_RE.test(address)) {
        return { error: 'address is required (0x + 40 hex chars)' }
      }
    }

    if (action === 'trends') {
      const metric = typeof args.metric === 'string' && args.metric.length > 0 ? args.metric : undefined
      if (!metric) {
        return { error: 'metric is required for trends' }
      }
    }

    const result = await fetchStatsAction(domain, action, args ?? {}, opts)
    // Pass through structured errors ({ error } or { error, action, status }) without truncating
    if (result && typeof result === 'object' && 'error' in result) {
      return result
    }
    return maybeTruncate(result)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

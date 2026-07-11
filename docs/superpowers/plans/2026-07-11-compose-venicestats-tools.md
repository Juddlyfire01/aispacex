# Compose VeniceStats Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Post compose agent always-on VeniceStats access via four domain tools (`stats_protocol`, `stats_market`, `stats_social`, `stats_wallet`) that cover the near-full MCP action catalog through the existing `/api/venicestats/proxy`.

**Architecture:** Expand `src/lib/venicestats` with a path/action router and typed fetch helpers. Add `stats-tools.ts` (schemas + async executor + truncation). Register tools in `compose-agent` (await network tools), include them in chat token estimates, and extend the system prompt for medium attribution.

**Tech Stack:** TypeScript, Vitest, existing VeniceStats proxy + `venicestatsGet`, compose agent tool loop, Venice public `/models` for `models` action.

**Spec:** `docs/superpowers/specs/2026-07-11-compose-venicestats-tools-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/lib/venicestats/paths.ts` | Action → REST path + query builder; metrics field projectors |
| `src/lib/venicestats/paths.test.ts` | Path/query builders + projectors |
| `src/lib/venicestats/client.ts` | Add `fetchStatsAction` (and keep existing five fetchers) |
| `src/lib/compose/stats-tools.ts` | `COMPOSE_STATS_TOOLS` + `executeStatsTool` |
| `src/lib/compose/stats-tools.test.ts` | Schemas, routing, errors, truncation (mocked fetch) |
| `src/lib/compose/compose-agent.ts` | Register tools; `await` `stats_*` |
| `src/lib/compose/compose-agent.test.ts` | Assert stats tools present / dispatch if covered |
| `src/lib/compose/compose-prompt.ts` | Tools + attribution copy |
| `src/lib/compose/compose-prompt.test.ts` | Assertions |
| `src/components/compose/compose-chat.tsx` | Include stats tools in token estimate |

---

## Verified REST path map (2026-07-11)

Use these in `paths.ts`. Proxy prefix is already `/api/venicestats/proxy`.

| Tool | `action` | Upstream |
|------|----------|----------|
| protocol | `overview` | `GET /api/metrics` (optional `category` filters projected fields) |
| protocol | `price` | `GET /api/metrics` → price/mcap/FDV fields only |
| protocol | `staking` | `GET /api/metrics` → staking/APR/lock/cooldown fields |
| protocol | `burns` | `GET /api/burns?limit&offset` |
| protocol | `burns_timeline` | `GET /api/burns-timeline?granularity&range` |
| protocol | `burn_stats_by_tier` | `GET /api/burn-stats-by-tier` |
| protocol | `discretionary_burn` | `GET /api/discretionary-burn` |
| protocol | `free_float` | `GET /api/metrics` → freeFloat* fields |
| protocol | `diem` | `GET /api/diem-analytics` (+ optional metrics DIEM subset merge) |
| protocol | `vesting` | `GET /api/vesting` |
| protocol | `airdrop` | `GET /api/airdrop` |
| protocol | `treasury` | `GET /api/treasury?mode=overview` |
| protocol | `simulate_revenue` | `GET /api/simulate-revenue` (+ query params when present) |
| protocol | `models` | Venice public API via `fetchModelsBundle('text')` (not VeniceStats REST) |
| market | `volume` | `GET /api/markets` and/or `GET /api/markets/volume?period` |
| market | `large_trades` | `GET /api/markets/large-swaps?limit` |
| market | `trends` | `GET /api/charts?period` → return only requested `metric` series (+ light summary) |
| market | `charts` | `GET /api/charts?period` then **downsample** series (default period `30d`) |
| market | `benchmarks` | **No public REST found** — return `{ error, action: 'benchmarks', unsupported: true }` |
| market | `insider_flow` | `GET /api/insider-flow` |
| social | `buzz` | `GET /api/buzz` (existing client) |
| social | `buzz_metrics` | `GET /api/buzz/metrics` (existing; map `weeks` → API as today) |
| social | `social` | `GET /api/social` (existing) |
| social | `live` | `GET /api/live?limit` |
| wallet | `wallet` | `GET /api/venetians?address=` (richer than holders-only) |
| wallet | `wallet_trades` | `GET /api/wallet-swaps?address=&limit&offset` |
| wallet | `leaderboard` | `GET /api/holders?limit&page` or `GET /api/venetians?mode=topStaking&limit` |

Source attribution links (prompt): `https://venicestats.com`, `/staking`, `/burns`, `/diem`, `/buzz`, `/markets`, `/treasury`, `/vesting`, `/airdrop`, `/wallet/{address}`.

---

### Task 1: Path map + metrics projectors

**Files:**
- Create: `src/lib/venicestats/paths.ts`
- Create: `src/lib/venicestats/paths.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/venicestats/paths.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildStatsRequest,
  projectMetrics,
  downsampleChartSeries,
  type StatsDomain,
} from './paths'

describe('buildStatsRequest', () => {
  it('maps burns to /api/burns with limit', () => {
    expect(buildStatsRequest('protocol', 'burns', { limit: 5 })).toEqual({
      kind: 'venicestats',
      path: '/api/burns',
      params: { limit: '5' },
    })
  })

  it('maps wallet to venetians address', () => {
    const addr = '0xd02eef6cff9cf07d1af73bc2a6edb5ab36a0869d'
    expect(buildStatsRequest('wallet', 'wallet', { address: addr })).toEqual({
      kind: 'venicestats',
      path: '/api/venetians',
      params: { address: addr },
    })
  })

  it('maps models to venice models', () => {
    expect(buildStatsRequest('protocol', 'models', {})).toEqual({
      kind: 'venice_models',
      type: 'text',
    })
  })

  it('marks benchmarks unsupported', () => {
    expect(buildStatsRequest('market', 'benchmarks', {})).toEqual({
      kind: 'unsupported',
      action: 'benchmarks',
    })
  })

  it('rejects unknown action', () => {
    expect(() => buildStatsRequest('social', 'nope' as never, {})).toThrow(/unknown/i)
  })
})

describe('projectMetrics', () => {
  const sample = {
    vvvPrice: 10,
    marketCap: 1,
    fdv: 2,
    totalStaked: 3,
    stakingRatio: 0.5,
    stakerApr: 8,
    freeFloatVvv: 4,
    diemPrice: 1000,
  }

  it('projects price fields', () => {
    const out = projectMetrics(sample, 'price')
    expect(out).toMatchObject({ vvvPrice: 10, marketCap: 1, fdv: 2 })
    expect(out).not.toHaveProperty('totalStaked')
  })

  it('projects staking fields', () => {
    expect(projectMetrics(sample, 'staking')).toMatchObject({
      totalStaked: 3,
      stakingRatio: 0.5,
      stakerApr: 8,
    })
  })
})

describe('downsampleChartSeries', () => {
  it('caps points per series', () => {
    const charts = {
      period: '30d',
      vvvPrice: Array.from({ length: 500 }, (_, i) => ({ t: i, v: i })),
    }
    const out = downsampleChartSeries(charts, 50)
    expect((out.vvvPrice as unknown[]).length).toBeLessThanOrEqual(50)
    expect(out.downsampled).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/venicestats/paths.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement `paths.ts`**

```typescript
// src/lib/venicestats/paths.ts
export type StatsDomain = 'protocol' | 'market' | 'social' | 'wallet'

export type StatsRequest =
  | { kind: 'venicestats'; path: string; params?: Record<string, string> }
  | { kind: 'venice_models'; type: string }
  | { kind: 'unsupported'; action: string }
  | { kind: 'metrics_project'; projection: MetricsProjection }

export type MetricsProjection =
  | 'overview'
  | 'price'
  | 'staking'
  | 'free_float'
  | 'category' // used with category param

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

export function buildStatsRequest(
  domain: StatsDomain,
  action: string,
  args: Record<string, unknown>,
): StatsRequest {
  // Implement full switch per table above.
  // For price/staking/free_float/overview: return { kind: 'metrics_project', projection }
  //   overview may still fetch full metrics; projection optional by category.
  // For benchmarks: return { kind: 'unsupported', action: 'benchmarks' }
  // Throw Error(`Unknown action: ${domain}.${action}`) for invalid combos.
  void domain
  void action
  void args
  void str
  void num
  throw new Error('not implemented')
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
  if (projection === 'overview' && category) {
    // Map category → key groups (token/staking/diem/burns/economics/growth/vesting)
    // Fall back to full metrics if unknown category.
  }
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
```

Fill in the full `buildStatsRequest` switch so all actions in the path map are covered. Prefer explicit cases over a giant data table if that stays readable; a const map is fine if typed tightly.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/venicestats/paths.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/venicestats/paths.ts src/lib/venicestats/paths.test.ts
git commit -m "feat(venicestats): action path map and metrics projectors"
```

---

### Task 2: Client `fetchStatsAction`

**Files:**
- Modify: `src/lib/venicestats/client.ts`
- Create: `src/lib/venicestats/client-stats.test.ts` (mock `fetch`)

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/venicestats/client-stats.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchStatsAction } from './client'

describe('fetchStatsAction', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ vvvPrice: 10, marketCap: 1, fdv: 2, totalStaked: 9 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('projects price from metrics', async () => {
    const out = await fetchStatsAction('protocol', 'price', {})
    expect(out).toMatchObject({ vvvPrice: 10, marketCap: 1 })
    expect(out).not.toHaveProperty('totalStaked')
  })

  it('returns unsupported for benchmarks', async () => {
    const out = await fetchStatsAction('market', 'benchmarks', {})
    expect(out).toMatchObject({ error: expect.any(String), unsupported: true, action: 'benchmarks' })
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/lib/venicestats/client-stats.test.ts`

Expected: FAIL (`fetchStatsAction` missing)

- [ ] **Step 3: Implement**

In `client.ts`, add:

```typescript
import { buildStatsRequest, downsampleChartSeries, projectMetrics } from './paths'
import { fetchModelsBundle } from '../venice-model-utils'
import type { StatsDomain } from './paths'

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
    const bundle = await fetchModelsBundle(req.type)
    return {
      source: 'venice.ai /models',
      note: 'Model catalog from Venice public API; attribute VeniceStats.com when presenting in chat per product norms.',
      models: bundle.models.slice(0, typeof args.limit === 'number' ? args.limit : 20),
    }
  }

  if (req.kind === 'metrics_project') {
    const metrics = (await venicestatsGet<Record<string, unknown>>('/api/metrics', undefined, opts?.signal)) 
    // extend venicestatsGet to accept optional AbortSignal
    return projectMetrics(metrics, req.projection, typeof args.category === 'string' ? args.category : undefined)
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
}
```

Extend private `venicestatsGet` to accept optional `signal?: AbortSignal` and pass it to `fetch`.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/venicestats/client-stats.test.ts src/lib/venicestats/paths.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/venicestats/client.ts src/lib/venicestats/client-stats.test.ts src/lib/venicestats/paths.ts
git commit -m "feat(venicestats): fetchStatsAction router for compose tools"
```

---

### Task 3: Compose stats tool schemas + executor

**Files:**
- Create: `src/lib/compose/stats-tools.ts`
- Create: `src/lib/compose/stats-tools.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/compose/stats-tools.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { COMPOSE_STATS_TOOLS, executeStatsTool } from './stats-tools'

describe('COMPOSE_STATS_TOOLS', () => {
  it('defines four domain tools', () => {
    expect(COMPOSE_STATS_TOOLS.map((t) => t.function.name)).toEqual([
      'stats_protocol',
      'stats_market',
      'stats_social',
      'stats_wallet',
    ])
    for (const t of COMPOSE_STATS_TOOLS) {
      expect(t.function.parameters.required).toContain('action')
      expect(t.function.parameters.additionalProperties).toBe(false)
    }
  })
})

describe('executeStatsTool', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes('/api/metrics')) {
          return new Response(JSON.stringify({ vvvPrice: 10, marketCap: 1, fdv: 2 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'missing mock' }), { status: 404 })
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('runs stats_protocol price', async () => {
    const result = await executeStatsTool('stats_protocol', { action: 'price' })
    expect(result).toMatchObject({ vvvPrice: 10 })
  })

  it('unknown tool name errors', async () => {
    const result = await executeStatsTool('stats_nope', { action: 'price' })
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('missing action errors', async () => {
    const result = await executeStatsTool('stats_social', {})
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('requires address for wallet', async () => {
    const result = await executeStatsTool('stats_wallet', { action: 'wallet' })
    expect(result).toEqual({ error: expect.stringMatching(/address/i) })
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/lib/compose/stats-tools.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement `stats-tools.ts`**

Mirror `intel-tools.ts` structure:

- `COMPOSE_STATS_TOOLS`: four `ToolDefinition`s with `action` enums from the spec and optional params (`address`, `limit`, `offset`, `period`, `metric`, `category`, `windows`, `type`, `granularity`, `range`, `mode`, sim knobs).
- `executeStatsTool(name, args, opts?)`: map name → domain (`stats_protocol` → `protocol`, …); validate required args per action (`address` for wallet/wallet_trades; `metric` for trends); call `fetchStatsAction`; wrap errors as `{ error }`; apply `maybeTruncate` (copy from history-tools, `TRUNCATE_CHARS = 32_000`).
- Export nothing that couples to React.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/compose/stats-tools.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/compose/stats-tools.ts src/lib/compose/stats-tools.test.ts
git commit -m "feat(compose): VeniceStats domain tool schemas and executor"
```

---

### Task 4: Wire compose-agent (async stats)

**Files:**
- Modify: `src/lib/compose/compose-agent.ts`
- Modify: `src/lib/compose/compose-agent.test.ts` (if it asserts tool lists / execution)

- [ ] **Step 1: Update tool registration**

In `runComposeAgent`, change tools array to:

```typescript
import { COMPOSE_STATS_TOOLS, executeStatsTool } from './stats-tools'

const tools: ToolDefinition[] = [
  ...COMPOSE_INTEL_TOOLS,
  ...COMPOSE_HISTORY_TOOLS,
  ...COMPOSE_STATS_TOOLS,
  ...(handoff ? [COMPOSE_WRITE_DRAFT_TOOL] : []),
]
```

- [ ] **Step 2: Async dispatch**

Replace the sync-only tool execution branch with:

```typescript
let result: unknown
if (name === COMPOSE_WRITE_DRAFT_TOOL_NAME) {
  // existing handoff branch
} else if (name.startsWith('compose_history_')) {
  result = executeHistoryTool(name, args, { snapshot: opts.historySnapshot })
} else if (name.startsWith('stats_')) {
  result = await executeStatsTool(name, args, { signal: opts.signal })
} else {
  result = executeIntelTool(name, args, {
    snapshot: opts.snapshot,
    scope: opts.scope,
  })
}
```

- [ ] **Step 3: Extend tests**

If `compose-agent.test.ts` captures the `tools` array passed to Venice, assert it includes `stats_protocol` (and ideally all four). Add a unit test that mocks `executeStatsTool` only if the agent test harness already stubs modules; otherwise keep assertion to tool list membership to avoid brittle stream mocks.

- [ ] **Step 4: Run**

Run: `npm test -- src/lib/compose/compose-agent.test.ts src/lib/compose/stats-tools.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/compose/compose-agent.ts src/lib/compose/compose-agent.test.ts
git commit -m "feat(compose): register async VeniceStats tools in agent loop"
```

---

### Task 5: Prompt + chat token estimate

**Files:**
- Modify: `src/lib/compose/compose-prompt.ts`
- Modify: `src/lib/compose/compose-prompt.test.ts`
- Modify: `src/components/compose/compose-chat.tsx`

- [ ] **Step 1: Extend `TOOLS_SPEC`**

Add under tools section:

```text
VeniceStats (live protocol + pulse):
- stats_protocol / stats_market / stats_social / stats_wallet — each takes an "action" (e.g. price, staking, burns, buzz, wallet). Prefer these for live VVV/DIEM/protocol/community numbers over guessing or web search.
- Prefer a focused call (overview, price, buzz_metrics) before many parallel actions.
- Chat: when citing figures from stats_*, name VeniceStats and include a relevant https://venicestats.com/... link.
- Drafts: bare figures OK; add short "via VeniceStats" when character budget allows.
- Do not speculate on price direction or give financial advice. If a tool errors, say so — never invent metrics.
```

Also update the Environment/Purpose lines lightly so “live VeniceStats tools” are mentioned once (keep prompt short).

- [ ] **Step 2: Update prompt tests**

Assert `toolsEnabled: true` system string matches `/stats_protocol|stats_\*/` and `/VeniceStats/` (attribution). Assert tools-disabled prompt does not advertise stats tools.

- [ ] **Step 3: Token estimate in `compose-chat.tsx`**

```typescript
import { COMPOSE_STATS_TOOLS } from '../../lib/compose/stats-tools'

const tools = [
  ...COMPOSE_INTEL_TOOLS,
  ...COMPOSE_HISTORY_TOOLS,
  ...COMPOSE_STATS_TOOLS,
  ...(handoff ? [COMPOSE_WRITE_DRAFT_TOOL] : []),
]
```

- [ ] **Step 4: Run**

Run: `npm test -- src/lib/compose/compose-prompt.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/compose/compose-prompt.ts src/lib/compose/compose-prompt.test.ts src/components/compose/compose-chat.tsx
git commit -m "feat(compose): prompt and context estimate for VeniceStats tools"
```

---

### Task 6: Verification

- [ ] **Step 1: Full unit suite for touched areas**

Run:

```bash
npm test -- src/lib/venicestats src/lib/compose/stats-tools.test.ts src/lib/compose/compose-agent.test.ts src/lib/compose/compose-prompt.test.ts
```

Expected: all PASS

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --pretty false`

Expected: no errors in touched files

- [ ] **Step 3: Manual smoke (dev server)**

1. Open Post composer with a tool-capable model.
2. Ask: “What is the current VVV price and staking ratio from VeniceStats?”
3. Confirm agent activity shows `stats_protocol` with `action: price` and/or `staking` / `overview`.
4. Confirm reply cites VeniceStats with a link and uses real numbers (not invented).
5. Ask: “What’s the buzz mood this week?” → `stats_social` / `buzz_metrics` or `social`.
6. Ask for a wallet (known address) → `stats_wallet` / `wallet`.

- [ ] **Step 4: Final commit only if smoke fixes needed**; otherwise done.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Four domain tools + actions | 3 |
| Near-full MCP catalog mapping | 1 (paths) |
| Existing proxy reuse | 2 |
| Async executor + truncation | 3–4 |
| Always on (no toggle) | 4–5 |
| Medium attribution in prompt | 5 |
| Token estimate includes tools | 5 |
| benchmarks unsupported until public path exists | 1–2 |
| models via Venice API | 1–2 |
| Tests | 1–6 |

---

## Notes for implementers

- Do **not** call Cursor MCP from the browser app.
- Do **not** refactor Stats/Signal UI hooks in this plan.
- Charts payloads are huge (~300KB raw) — always downsample before returning to the model.
- Wallet address validation: `^0x[a-fA-F0-9]{40}$` before fetch.
- Keep tool descriptions short; put detail in `action` enum descriptions where needed.

# Compose VeniceStats Tools — Design

**Date:** 2026-07-11  
**Status:** Approved  
**Product:** AiSpaceX Post composer  
**Depends on:** Compose intel/history tools (`intel-tools`, `history-tools`, `compose-agent`)

---

## 1. Intent

Equip the main Post compose agent with **live VeniceStats** (protocol + community pulse) so drafts and analysis can be grounded in on-chain and buzz data without inventing numbers.

**Goal:** Near-full VeniceStats MCP catalog, exposed as a small set of **domain tools** with an `action` enum, always available when tools are enabled.

**Non-goals:**

- In-browser MCP / Cursor `user-venicestats` bridge
- Stats/Signal UI refactor onto the expanded client (may reuse later)
- Settings toggle or dynamic tool injection
- Hard enforcement of attribution (prompt guidance only)
- Price direction speculation or financial advice features

---

## 2. Locked decisions

| Decision | Choice |
|----------|--------|
| Purpose | Protocol facts **and** community pulse |
| Catalog breadth | Near-full MCP surface via public REST + existing proxy |
| Packaging | Four domain tools + `action` param |
| Availability | Always on when compose tools are enabled |
| Attribution | Medium — chat names VeniceStats + link; drafts may use bare figures with short “via VeniceStats” when space allows |
| Architecture | Compose tools → expand `lib/venicestats` client → `/api/venicestats/proxy` |

---

## 3. Architecture

```
compose-agent tool loop
  → COMPOSE_STATS_TOOLS (4 ToolDefinitions)
  → executeStatsTool(name, args)   // async
  → src/lib/venicestats/client.ts  // typed fetchers per action
  → /api/venicestats/proxy/<path>
  → https://venicestats.com/...
```

**Reuse:** Existing CORS proxy (`api/venicestats/proxy.ts`) and truncation/error patterns from `intel-tools` / `history-tools`.

**Change vs intel/history:** Stats executors are **async** (network). `compose-agent` must `await` `stats_*` results and forward `AbortSignal` where practical.

---

## 4. Tool surface

### 4.1 Tools

| Tool | Role |
|------|------|
| `stats_protocol` | Protocol KPIs, burns, DIEM, vesting, treasury, revenue sim, models catalog |
| `stats_market` | Volume, whales, trends, charts, benchmarks, insider flow |
| `stats_social` | Buzz feed, buzz metrics, social/sentiment, live events |
| `stats_wallet` | Wallet profile, wallet trades, holder leaderboard |

### 4.2 Action maps (MCP ↔ action)

**`stats_protocol`**

| `action` | MCP analogue |
|----------|----------------|
| `overview` | `venicestats_protocol_overview` |
| `price` | `venicestats_price` |
| `staking` | `venicestats_staking` |
| `burns` | `venicestats_burns` |
| `burns_timeline` | `venicestats_burns_timeline` |
| `burn_stats_by_tier` | `venicestats_burn_stats_by_tier` |
| `discretionary_burn` | `venicestats_discretionary_burn` |
| `free_float` | `venicestats_free_float` |
| `diem` | `venicestats_diem` |
| `vesting` | `venicestats_vesting` |
| `airdrop` | `venicestats_airdrop` |
| `treasury` | `venicestats_treasury` |
| `simulate_revenue` | `venicestats_simulate_revenue` |
| `models` | `venice_models` |

**`stats_market`**

| `action` | MCP analogue |
|----------|----------------|
| `volume` | `venicestats_market_volume` |
| `large_trades` | `venicestats_large_trades` |
| `trends` | `venicestats_trends` |
| `charts` | existing `/api/charts` (UI) |
| `benchmarks` | `venicestats_token_benchmarks` |
| `insider_flow` | `venicestats_insider_flow` |

**`stats_social`**

| `action` | MCP analogue |
|----------|----------------|
| `buzz` | `venicestats_buzz` / existing `/api/buzz` |
| `buzz_metrics` | `venicestats_buzz_metrics` / existing `/api/buzz/metrics` |
| `social` | `venicestats_social` / existing `/api/social` |
| `live` | `venicestats_live` |

**`stats_wallet`**

| `action` | MCP analogue |
|----------|----------------|
| `wallet` | `venicestats_wallet` |
| `wallet_trades` | `venicestats_wallet_trades` |
| `leaderboard` | `venicestats_leaderboard` |

### 4.3 Schema conventions

- Required: `action` (string enum for that tool).
- Optional params only when needed by that action (e.g. `address`, `limit`, `offset`, `period`, `windows`, `type`, simulation knobs). Document each optional field in the tool `parameters` with clear descriptions; unused params ignored.
- `additionalProperties: false` on each tool’s parameters object.
- Unknown `action` or missing required param for that action → `{ error: string }` (do not throw out of the executor).

### 4.4 REST path mapping

During implementation, map each action to a concrete `venicestats.com` path (and query params). Prefer paths already used by the app where they exist:

- `/api/metrics`, `/api/charts`, `/api/buzz`, `/api/buzz/metrics`, `/api/social`

For MCP-only capabilities, discover paths from VeniceStats public API / MCP behavior and document them in `client.ts` (or a small `paths.ts` table). Proxy already allows arbitrary paths under `/api/venicestats/proxy`.

If upstream returns 404/502, executor returns `{ error, action, status? }` — tool round continues.

---

## 5. Client layer

**File:** `src/lib/venicestats/client.ts` (keep; extend)

- Preserve existing `fetchVeniceMetrics`, `fetchVeniceCharts`, `fetchBuzz`, `fetchBuzzMetrics`, `fetchSocial`.
- Add typed fetch helpers (or one `fetchStatsAction(domain, action, params)` router) for the new actions.
- Shared `venicestatsGet` remains the HTTP primitive; timeouts rely on proxy (~20s) + optional client `AbortSignal`.
- Types: extend `types.ts` / `signal-types.ts` or add `stats-tool-types.ts` only where needed; prefer `unknown`-safe narrowing at boundaries over inventing full upstream schemas for every endpoint on day one. Prefer returning JSON as-is with light shaping (strip huge unused nests only if truncation requires it).

**Out of scope for this change:** Rewiring React Query hooks / Stats UI to new fetchers.

---

## 6. Compose wiring

### 6.1 New module

- `src/lib/compose/stats-tools.ts` — `COMPOSE_STATS_TOOLS`, `executeStatsTool`
- `src/lib/compose/stats-tools.test.ts` — schemas, routing, errors, truncation (mock fetch)

### 6.2 Agent loop (`compose-agent.ts`)

- Spread `...COMPOSE_STATS_TOOLS` into the tools array (with intel, history, optional draft).
- Dispatch: if `name.startsWith('stats_')` → `result = await executeStatsTool(name, args, { signal })`.
- Keep intel/history sync path unchanged.
- Cap tool rounds unchanged (`MAX_TOOL_ROUNDS`).

### 6.3 Context estimate / chat UI

- `compose-chat.tsx` (and any other place that lists tools for token estimate) includes `COMPOSE_STATS_TOOLS`.
- Agent activity already shows tool name + args; ensure `action` is visible in args (no special UI required).

### 6.4 System prompt (`compose-prompt.ts`)

Extend tools section when `toolsEnabled`:

- Prefer `stats_*` for live Venice protocol / pulse numbers over guessing or generic web search.
- Prefer a focused call (`overview` / `price` / `buzz_metrics`) before many parallel actions.
- Chat citations: name VeniceStats and include a relevant `https://venicestats.com/...` link.
- Drafts: bare figures OK; short “via VeniceStats” when character budget allows.
- Do not speculate on price direction or give financial advice.
- If a tool errors or returns empty, say so; do not fabricate metrics.

Update `compose-prompt.test.ts` accordingly.

---

## 7. Truncation & payload hygiene

- Reuse ~32k character JSON truncate pattern from intel/history tools.
- Prefer shrinking arrays (burns list, buzz items, trades, chart points) before dropping the whole payload.
- For `charts` / `trends`, default to a modest period and/or downsample in the executor if raw payloads are routinely huge (document default `period` in schema).

---

## 8. Attribution & safety (prompt-level)

Aligned with VeniceStats product norms, softened for X drafts:

| Surface | Rule |
|---------|------|
| Chat | When citing numbers from `stats_*`, mention VeniceStats and link |
| Draft / postdraft / writer brief | Numbers may stand alone; add “via VeniceStats” when space allows |
| Always | No invented metrics; no price-direction advice |

No post-processing validator in v1.

---

## 9. Testing

| Area | Coverage |
|------|----------|
| Schemas | Four tools registered; `action` enums complete; `additionalProperties: false` |
| Executor | Mocked fetch success per domain; unknown action; HTTP error shape; abort if implemented |
| Truncation | Oversized array payload shrinks with `truncated: true` |
| Agent | Tools list includes stats; `stats_*` path is awaited (unit/mock) |
| Prompt | System string mentions `stats_*` and attribution when tools enabled |

---

## 10. File touch list

| Path | Change |
|------|--------|
| `src/lib/venicestats/client.ts` (+ types as needed) | New fetchers / action router + path map |
| `src/lib/compose/stats-tools.ts` | New |
| `src/lib/compose/stats-tools.test.ts` | New |
| `src/lib/compose/compose-agent.ts` | Register + async dispatch |
| `src/lib/compose/compose-agent.test.ts` | Assert tools / dispatch if present |
| `src/lib/compose/compose-prompt.ts` | Tools + attribution copy |
| `src/lib/compose/compose-prompt.test.ts` | Assertions |
| `src/components/compose/compose-chat.tsx` | Include stats tools in token estimate |
| `src/hooks/use-compose.ts` | Only if tool list is duplicated there |

No change required to `api/venicestats/proxy.ts` unless path quirks appear during mapping.

---

## 11. Implementation order

1. Path map + client fetchers for all actions (stub missing types loosely).
2. `stats-tools.ts` schemas + async executor + tests.
3. Wire `compose-agent` + chat token estimate.
4. Prompt + prompt tests.
5. Manual smoke: compose turn asking for VVV price / buzz → tool event → grounded reply.

---

## 12. Success criteria

- Compose agent can answer protocol and pulse questions using live VeniceStats data without web search.
- Tool schemas stay small (four tools) while covering the MCP-equivalent action set.
- Failures degrade to `{ error }` and honest chat, not crashes or invented numbers.
- Medium attribution guidance is present in the system prompt.

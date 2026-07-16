import type { AlphaRail } from './types'

/** Soft cap on system + user rails (operator budget, not a paywall). */
export const ALPHA_MAX_RAILS = 8

/** Band 1 counts cache TTL (ms). */
export const ALPHA_COUNTS_TTL_MS = 12 * 60_000

/** Cold archive retention for unpinned items (product: trending window). */
export const ALPHA_COLD_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Product-owned Radar pack. Queries are X recent-search / counts operators.
 * Tunable here — users can disable or add rails (soft cap ALPHA_MAX_RAILS).
 */
export const SYSTEM_RAIL_DEFS: readonly Omit<AlphaRail, 'enabled'>[] = [
  {
    id: 'sys-sphere',
    label: 'Venice sphere',
    query:
      '(VeniceAI OR @AskVenice OR $VVV OR "venice.ai" OR "Venice AI") -is:retweet lang:en',
    source: 'system',
  },
  {
    id: 'sys-privacy',
    label: 'Uncensored / local AI',
    query:
      '(uncensored OR "open weight" OR open-weight OR "local LLM" OR "private AI" OR "own your models") (AI OR LLM) -is:retweet lang:en',
    source: 'system',
  },
  {
    id: 'sys-agents',
    label: 'AI agents',
    query:
      '("AI agent" OR agentic OR "tool use" OR MCP OR "autonomous agent") (AI OR LLM OR crypto) -is:retweet lang:en',
    source: 'system',
  },
  {
    id: 'sys-xai',
    label: 'Grok / xAI',
    query: '(Grok OR xAI OR @xai OR @grok) (AI OR model OR launch OR update) -is:retweet lang:en',
    source: 'system',
  },
]

export function buildDefaultSystemRails(): AlphaRail[] {
  return SYSTEM_RAIL_DEFS.map((r) => ({ ...r, enabled: true }))
}

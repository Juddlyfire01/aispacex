import type { VeniceModel } from '../../types/venice'

export const DEFAULT_CONTEXT_FALLBACK = 128_000
export const DEFAULT_BUDGET_PCT = 0.5

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function resolveContextLimit(model: VeniceModel | undefined | null): number {
  const n = model?.model_spec?.availableContextTokens
  if (typeof n === 'number' && n > 0) return n
  return DEFAULT_CONTEXT_FALLBACK
}

/** Reserved for system prompt, tool schemas, and short transcript headroom. */
export function reservedOverhead(contextLimit: number): number {
  return Math.min(8_000, Math.floor(contextLimit * 0.1))
}

export function clampBudgetPct(pct: number): number {
  if (Number.isNaN(pct)) return DEFAULT_BUDGET_PCT
  return Math.min(0.75, Math.max(0.25, pct))
}

export function computeHotBudget(contextLimit: number, budgetPct: number): number {
  const pct = clampBudgetPct(budgetPct)
  const usable = Math.max(0, contextLimit - reservedOverhead(contextLimit))
  return Math.floor(usable * pct)
}

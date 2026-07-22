import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import type { TokenUsage } from '../lib/venice/usage-cost'
import { estimateUsageUsd } from '../lib/venice/usage-cost'
import type { VeniceModel } from '../types/venice'
import { recordCost } from './cost-ledger-store'
import type { CostKind } from '../lib/cost/ledger'

interface VeniceCostState {
  /** USD spend this page load (not persisted). */
  sessionCost: number
  /** All-time Venice USD spend (persisted). */
  lifetimeTotal: number
  addUsage: (
    model: VeniceModel | undefined | null,
    usage: TokenUsage | undefined | null,
    ledger?: LedgerContext,
  ) => void
  addUsd: (usd: number, ledger?: LedgerContext) => void
}

/** Optional grouping/metadata forwarded to the unified cost ledger. */
export interface LedgerContext {
  action?: string
  kind?: CostKind
  meta?: Record<string, unknown>
}

export const useVeniceCostStore = create<VeniceCostState>()(
  persist(
    (set) => ({
      sessionCost: 0,
      lifetimeTotal: 0,

      addUsage: (model, usage, ledger) => {
        const usd = estimateUsageUsd(model, usage)
        if (usd <= 0) return
        set((s) => ({
          sessionCost: s.sessionCost + usd,
          lifetimeTotal: s.lifetimeTotal + usd,
        }))
        // Mirror into the unified ledger. Units = total tokens when known.
        const units =
          usage?.total_tokens ??
          (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0)
        recordCost({
          action: ledger?.action,
          provider: 'venice',
          kind: ledger?.kind ?? 'text',
          units: units || 1,
          unitPriceUsd: units ? usd / units : usd,
          rawUsd: usd,
          meta: { modelId: model?.id, ...ledger?.meta },
        })
      },

      addUsd: (usd, ledger) => {
        if (!(usd > 0)) return
        set((s) => ({
          sessionCost: s.sessionCost + usd,
          lifetimeTotal: s.lifetimeTotal + usd,
        }))
        recordCost({
          action: ledger?.action,
          provider: 'venice',
          kind: ledger?.kind ?? 'text',
          units: 1,
          unitPriceUsd: usd,
          rawUsd: usd,
          meta: ledger?.meta,
        })
      },
    }),
    {
      name: 'venice-api-cost',
      version: 1,
      storage: createJSONStorage(() => createEncryptedStorage()),
      partialize: (s) => ({ lifetimeTotal: s.lifetimeTotal }),
    },
  ),
)

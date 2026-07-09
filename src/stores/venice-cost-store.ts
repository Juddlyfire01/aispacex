import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../lib/safe-storage'
import type { TokenUsage } from '../lib/venice/usage-cost'
import { estimateUsageUsd } from '../lib/venice/usage-cost'
import type { VeniceModel } from '../types/venice'

interface VeniceCostState {
  /** USD spend this page load (not persisted). */
  sessionCost: number
  /** All-time Venice USD spend (persisted). */
  lifetimeTotal: number
  addUsage: (model: VeniceModel | undefined | null, usage: TokenUsage | undefined | null) => void
  addUsd: (usd: number) => void
}

export const useVeniceCostStore = create<VeniceCostState>()(
  persist(
    (set) => ({
      sessionCost: 0,
      lifetimeTotal: 0,

      addUsage: (model, usage) => {
        const usd = estimateUsageUsd(model, usage)
        if (usd <= 0) return
        set((s) => ({
          sessionCost: s.sessionCost + usd,
          lifetimeTotal: s.lifetimeTotal + usd,
        }))
      },

      addUsd: (usd) => {
        if (!(usd > 0)) return
        set((s) => ({
          sessionCost: s.sessionCost + usd,
          lifetimeTotal: s.lifetimeTotal + usd,
        }))
      },
    }),
    {
      name: 'venice-api-cost',
      version: 1,
      storage: createJSONStorage(() => createSafeStorage()),
      partialize: (s) => ({ lifetimeTotal: s.lifetimeTotal }),
    },
  ),
)

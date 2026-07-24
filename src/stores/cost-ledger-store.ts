import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import {
  type CostEntry,
  type CostEntryInput,
  type CostProvider,
  type ActionCost,
  makeEntry,
  groupByAction,
} from '../lib/cost/ledger'
import { trimEntries, USAGE_WINDOW_DAYS, windowStartMs } from '../lib/cost/usage-analytics'

/**
 * Soft cap on retained entries. Primary retention is the 30-day time window;
 * this caps extreme volume within the window.
 */
const MAX_ENTRIES = 5000

interface ProviderTotals {
  x: number
  venice: number
}

interface CostLedgerState {
  /** Rolling window of recent entries (newest last). Persisted for 30 days. */
  entries: CostEntry[]
  /** USD spend this page load, split by provider (not persisted). */
  session: ProviderTotals
  /** All-time USD spend, split by provider (persisted). */
  lifetime: ProviderTotals

  /** Record a cost line item. Returns the created entry. */
  recordCost: (input: CostEntryInput) => CostEntry
  /** Entries grouped by their logical action. */
  actions: () => ActionCost[]
  /** Session total (optionally one provider). */
  sessionTotal: (provider?: CostProvider) => number
  /** Lifetime total (optionally one provider). */
  lifetimeTotal: (provider?: CostProvider) => number
  /** Clear the rolling entry window (keeps lifetime totals). */
  clearEntries: () => void
}

function prune(entries: CostEntry[]): CostEntry[] {
  return trimEntries(entries, {
    sinceMs: windowStartMs(USAGE_WINDOW_DAYS),
    maxEntries: MAX_ENTRIES,
  })
}

export const useCostLedgerStore = create<CostLedgerState>()(
  persist(
    (set, get) => ({
      entries: [],
      session: { x: 0, venice: 0 },
      lifetime: { x: 0, venice: 0 },

      recordCost: (input) => {
        const entry = makeEntry(input)
        if (entry.rawUsd <= 0) {
          // Still return the entry for callers, but don't mutate totals/window
          // with zero-cost noise (e.g. empty gathers, unpriced models).
          return entry
        }
        set((s) => {
          const entries = prune([...s.entries, entry])
          return {
            entries,
            session: {
              ...s.session,
              [entry.provider]: s.session[entry.provider] + entry.rawUsd,
            },
            lifetime: {
              ...s.lifetime,
              [entry.provider]: s.lifetime[entry.provider] + entry.rawUsd,
            },
          }
        })
        return entry
      },

      actions: () => groupByAction(get().entries),

      sessionTotal: (provider) => {
        const s = get().session
        return provider ? s[provider] : s.x + s.venice
      },

      lifetimeTotal: (provider) => {
        const l = get().lifetime
        return provider ? l[provider] : l.x + l.venice
      },

      clearEntries: () => set({ entries: [] }),
    }),
    {
      name: 'cost-ledger',
      version: 2,
      storage: createJSONStorage(() => createEncryptedStorage()),
      // Persist lifetime + entries (30d). Session totals reset each load.
      partialize: (s) => ({ lifetime: s.lifetime, entries: s.entries }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as {
          lifetime?: ProviderTotals
          entries?: CostEntry[]
        }
        const lifetime = p.lifetime ?? { x: 0, venice: 0 }
        const entries =
          version >= 2 && Array.isArray(p.entries) ? prune(p.entries) : []
        return { lifetime, entries, session: { x: 0, venice: 0 } }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const pruned = prune(state.entries)
        if (pruned.length !== state.entries.length) {
          useCostLedgerStore.setState({ entries: pruned })
        }
      },
    },
  ),
)

/**
 * Imperative helper for non-React call sites (lib functions, hooks outside the
 * component tree). Mirrors the pattern used by venice-cost-store consumers.
 */
export function recordCost(input: CostEntryInput): CostEntry {
  return useCostLedgerStore.getState().recordCost(input)
}

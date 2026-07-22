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

/**
 * Cap on retained entries. The ledger is a rolling window for the meter + x402
 * reconciliation, not an audit log — session/lifetime totals are kept exactly
 * regardless of trimming. Oldest entries are dropped past this cap.
 */
const MAX_ENTRIES = 2000

interface ProviderTotals {
  x: number
  venice: number
}

interface CostLedgerState {
  /** Rolling window of recent entries (newest last). Not fully persisted. */
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
          const entries = [...s.entries, entry]
          if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
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
      version: 1,
      storage: createJSONStorage(() => createEncryptedStorage()),
      // Persist lifetime totals only. The rolling entry window and session
      // totals are ephemeral (session resets each load; entries are a cache).
      partialize: (s) => ({ lifetime: s.lifetime }),
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

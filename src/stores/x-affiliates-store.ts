// Store for X organization affiliate rosters — the list of accounts affiliated
// with a Verified Organization (e.g. Venice / @AskVenice), fetched via
// GET /users/{orgId}/affiliates. Org-keyed and generic: any org can be cached.
//
// Rosters are persisted (encrypted at rest, like the intel reports) so the
// affiliate list survives reloads; a manual Refresh re-fetches and replaces the
// stored roster, stamping a new `fetchedAt`. Venice is the default org and can
// be fetched gratis (app-only bearer via the demo proxy); any other org needs
// an OAuth-connected X account.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import type { Profile } from '../lib/x-intel/types'

/** The Venice org — the default affiliate roster, fetchable without OAuth. */
export const VENICE_ORG = {
  id: '1764736490515685376',
  username: 'AskVenice',
  name: 'Venice',
} as const

/** One cached organization affiliate roster. */
export interface AffiliateRoster {
  /** Org account id (path param for the affiliates endpoint). */
  orgId: string
  /** Org handle without @ (display + storage key, case-preserved). */
  orgUsername: string
  /** Org display name, when known. */
  orgName: string | null
  /** Affiliated accounts, normalized to Profiles. */
  members: Profile[]
  /** ISO timestamp of the last successful fetch. */
  fetchedAt: string
}

interface XAffiliatesState {
  /** Rosters keyed by lowercased org username. */
  rosters: Record<string, AffiliateRoster>
  /** Save (or replace) a roster for an org. */
  setRoster: (roster: AffiliateRoster) => void
  /** Drop one cached roster by org username. */
  removeRoster: (orgUsername: string) => void
  /** Hard-clear every cached roster (Settings → Data & privacy). */
  clearAll: () => void
}

/** Lowercased, @-stripped storage key for an org username. */
export function orgKey(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase()
}

export const useXAffiliatesStore = create<XAffiliatesState>()(
  persist(
    (set) => ({
      rosters: {},

      setRoster: (roster) =>
        set((s) => ({
          rosters: { ...s.rosters, [orgKey(roster.orgUsername)]: roster },
        })),

      removeRoster: (orgUsername) =>
        set((s) => {
          const key = orgKey(orgUsername)
          if (!s.rosters[key]) return s
          const rosters = { ...s.rosters }
          delete rosters[key]
          return { rosters }
        }),

      clearAll: () => set({ rosters: {} }),
    }),
    {
      name: 'x-affiliates',
      version: 1,
      storage: createJSONStorage(() => createEncryptedStorage()),
      partialize: (s) => ({ rosters: s.rosters }),
    },
  ),
)

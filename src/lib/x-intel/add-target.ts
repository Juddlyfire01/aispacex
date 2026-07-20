import { toast } from '../../stores/toast-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { runGather } from './orchestrate'
import type { Profile } from './types'

/**
 * Add a profile to the Others rail with toaster feedback (no OS confirm).
 * No OAuth required — public gather uses the app bearer when disconnected.
 * Undo removes the target from the rail.
 *
 * Always kicks off a fresh gather on add — even for a previously-cached target —
 * so the rail never shows stale metrics/posts after (re-)adding. An optional
 * `seedProfile` (e.g. from the affiliates roster, already fetched) is shown
 * immediately so the row isn't blank while the gather runs.
 */
export function addTargetWithToast(username: string, seedProfile?: Profile): void {
  const handle = username.replace(/^@/, '').trim()
  if (!handle) return
  const subject = `@${handle}`

  const { targets, addTarget, seedTarget, removeTarget } = useXIntelStore.getState()
  const lower = handle.toLowerCase()
  const alreadyOnRail = targets.some((t) => t.toLowerCase() === lower)

  // Seed with the pre-fetched profile when provided (instant identity), else
  // create/focus the rail entry the normal way.
  if (seedProfile) seedTarget(seedProfile)
  else addTarget(handle)

  if (alreadyOnRail) {
    toast.info('Already on rail — refreshing', subject)
  } else {
    toast.success('Added to rail', subject, {
      label: 'Undo',
      onClick: () => removeTarget(handle),
    })
  }

  // Always refresh on add so cached/stale data is brought current.
  runGather(handle).catch(() => {
    /* gather errors surface in the target rail */
  })
}

/**
 * Bulk-add many profiles to the rail at once (e.g. an org's whole affiliate
 * roster). Seeds each with its already-fetched profile for instant identity,
 * skips any already on the rail, kicks off a background gather per newly-added
 * target, and shows ONE summary toast (not one per profile). Returns how many
 * were newly added.
 */
export function addTargetsWithToast(profiles: Profile[]): number {
  const { targets, seedTarget } = useXIntelStore.getState()
  const onRail = new Set(targets.map((t) => t.toLowerCase()))
  const toAdd = profiles.filter((p) => p.username && !onRail.has(p.username.toLowerCase()))

  if (toAdd.length === 0) {
    toast.info('Already on rail', 'Every affiliate is already a target.')
    return 0
  }

  for (const profile of toAdd) {
    seedTarget(profile)
    runGather(profile.username).catch(() => {
      /* gather errors surface in the target rail */
    })
  }

  toast.success(
    `Added ${toAdd.length} ${toAdd.length === 1 ? 'profile' : 'profiles'}`,
    'Refreshing in the background…',
  )
  return toAdd.length
}

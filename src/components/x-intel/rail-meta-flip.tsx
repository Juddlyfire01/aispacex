import type { Affiliation } from '../../lib/x-intel/types'
import { useSettingsStore } from '../../stores/settings-store'
import { useX402Store } from '../../stores/x402-store'
import { X402_ENABLED } from '../../lib/x402/config'
import { cn } from '../../lib/utils'

const FLIP_MS = 320
/** Fixed stage — wide enough for `$0.000`, tall enough for a dominant badge. */
const STAGE = 'h-[14px] w-[34px]'

/**
 * Rail trailing meta: affiliation badge is the resting face; on row hover it
 * Y-flips to the per-profile cost (same flip language as CostMeter).
 * If only one side exists, no flip — just that face.
 *
 * Free/BYOK: shows lifetime raw API spend (`cost` / totalCost).
 * Credits wallet connected: shows credits actually charged for this target —
 * not raw lifetime spend × margin (that would inflate Free-era totals).
 * Affiliate rows always flip to the credits face when a wallet is connected (incl. $0.000).
 */
export function RailMetaFlip({
  affiliation,
  cost,
  username,
  active,
}: {
  affiliation: Affiliation | null | undefined
  cost: number
  username: string
  active?: boolean
}) {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion)
  const address = useX402Store((s) => s.address)
  const status = useX402Store((s) => s.status)
  const chargedByTarget = useX402Store((s) => s.chargedByTarget)
  const showCredits = X402_ENABLED && status === 'connected' && Boolean(address)
  const targetKey = username.trim().replace(/^@/, '').toLowerCase()
  const displayCost = showCredits ? (chargedByTarget[targetKey] ?? 0) : cost
  const hasBadge = Boolean(affiliation?.badgeUrl)
  // Free/BYOK: only flip when there is spend to show.
  // Credits wallet: always mount the credits face next to a badge so hover still
  // flips (even at $0.000) — otherwise affiliate rows look "stuck" on the badge.
  const hasCost = displayCost > 0 || (showCredits && hasBadge)
  if (!hasBadge && !hasCost) return null

  const costFace = (
    <span
      title={
        showCredits
          ? `Credits charged for @${username}`
          : `All-time API spend for @${username}`
      }
      className={cn(
        'font-mono tabular-nums text-[9px] leading-none',
        active ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-tertiary)]',
      )}
    >
      ${displayCost.toFixed(3)}
    </span>
  )

  const badgeFace = hasBadge ? (
    <img
      src={affiliation!.badgeUrl}
      alt=""
      title={`Affiliated with ${affiliation!.org?.name ?? affiliation!.description ?? 'an organization'}`}
      className="h-3.5 w-3.5 rounded-[3px] object-contain"
      draggable={false}
    />
  ) : null

  // Single face — no flip needed.
  if (hasBadge && !hasCost) {
    return <span className={cn(STAGE, 'inline-flex items-center justify-center shrink-0')}>{badgeFace}</span>
  }
  if (!hasBadge && hasCost) {
    return <span className={cn(STAGE, 'inline-flex items-center justify-end shrink-0')}>{costFace}</span>
  }

  // Both: badge rests; cost reveals on row hover via Y-flip.
  if (reduceMotion) {
    return (
      <span className={cn(STAGE, 'relative inline-flex items-center justify-center shrink-0')}>
        <span className="absolute inset-0 flex items-center justify-center group-hover:opacity-0 transition-opacity">
          {badgeFace}
        </span>
        <span className="absolute inset-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          {costFace}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn(STAGE, 'relative block shrink-0')}
      style={{ perspective: 140, perspectiveOrigin: '50% 50%' }}
      aria-hidden
    >
      <span
        className={cn(
          STAGE,
          'absolute inset-0 transition-transform ease-in-out',
          'group-hover:[transform:rotateY(180deg)]',
        )}
        style={{
          transformStyle: 'preserve-3d',
          transitionDuration: `${FLIP_MS * 2}ms`,
        }}
      >
        <span
          className={cn(STAGE, 'absolute inset-0 flex items-center justify-center')}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {badgeFace}
        </span>
        <span
          className={cn(STAGE, 'absolute inset-0 flex items-center justify-end')}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {costFace}
        </span>
      </span>
    </span>
  )
}

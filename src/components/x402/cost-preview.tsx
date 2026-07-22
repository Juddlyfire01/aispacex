import { X402_MARGIN } from '../../lib/x402/config'
import { chargedPrice } from '../../lib/x402/pricing'
import { isPaidModeActive } from '../../lib/x402/charge-flow'

function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`
}

/**
 * Inline "this action will cost ~$X" preview for paid mode. Given a projected
 * raw API cost, shows the charged price (raw × margin). Renders nothing when
 * paid mode is inactive so it's safe to drop next to any action button.
 */
export function CostPreview({
  projectedRawUsd,
  className,
  label = 'Est. cost',
}: {
  projectedRawUsd: number
  className?: string
  label?: string
}) {
  if (!isPaidModeActive()) return null
  if (!(projectedRawUsd > 0)) return null
  const charged = chargedPrice(projectedRawUsd)
  return (
    <span
      className={className}
      title={`Raw API cost ${fmtUsd(projectedRawUsd)} × ${X402_MARGIN.toFixed(2)} margin`}
    >
      {label}:{' '}
      <span className="font-mono tabular-nums text-[var(--color-text-secondary)]">
        {fmtUsd(charged)}
      </span>
    </span>
  )
}

/**
 * Itemized preview table for a set of projected line items (e.g. before a
 * report gather). Each line shows units, raw, and charged. Renders nothing when
 * paid mode is inactive.
 */
export function CostPreviewList({
  items,
  className,
}: {
  items: { label: string; rawUsd: number; units?: number }[]
  className?: string
}) {
  if (!isPaidModeActive()) return null
  const positive = items.filter((i) => i.rawUsd > 0)
  if (positive.length === 0) return null
  const totalRaw = positive.reduce((acc, i) => acc + i.rawUsd, 0)
  const totalCharged = chargedPrice(totalRaw)
  return (
    <div className={className}>
      <ul className="space-y-0.5">
        {positive.map((i, idx) => (
          <li
            key={`${i.label}-${idx}`}
            className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-text-tertiary)]"
          >
            <span className="truncate">
              {i.label}
              {i.units != null ? ` ×${i.units}` : ''}
            </span>
            <span className="font-mono tabular-nums">{fmtUsd(chargedPrice(i.rawUsd))}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 pt-1 border-t border-[var(--color-border-faint)] flex items-center justify-between text-[12px] text-[var(--color-text-secondary)]">
        <span>Total (× {X402_MARGIN.toFixed(2)})</span>
        <span className="font-mono tabular-nums">{fmtUsd(totalCharged)}</span>
      </div>
    </div>
  )
}

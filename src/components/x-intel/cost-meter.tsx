import { useXIntelStore } from '../../stores/x-intel-store'
import { RAIL_FOOTER_CLASS, RAIL_FOOTER_STACK_CLASS } from '../layout/rail-footer'

export function CostMeter() {
  const sessionCost = useXIntelStore((s) => s.sessionCost)
  const lifetimeTotal = useXIntelStore((s) => s.lifetimeTotal)

  return (
    <div className={RAIL_FOOTER_CLASS}>
      <div className={RAIL_FOOTER_STACK_CLASS}>
        <div className="flex h-[13px] items-center justify-between gap-1.5 text-[9px] leading-none text-[var(--color-text-tertiary)]">
          <span className="shrink-0" title="API spend this page load">Session</span>
          <span className="font-mono tabular-nums">${sessionCost.toFixed(3)}</span>
        </div>
        <div className="flex h-[15px] items-center justify-between gap-1.5 text-[11px] leading-none text-[var(--color-text-secondary)]">
          <span className="shrink-0" title="All-time API spend across all profiles">Total</span>
          <span className="font-mono shrink-0 tabular-nums">${lifetimeTotal.toFixed(3)}</span>
        </div>
      </div>
    </div>
  )
}

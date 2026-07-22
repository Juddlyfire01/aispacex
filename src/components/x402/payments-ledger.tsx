import type { X402LedgerRow } from '../../stores/x402-store'

function fmtUsd(n: number): string {
  return `$${Math.abs(n).toFixed(n !== 0 && Math.abs(n) < 1 ? 4 : 2)}`
}

function label(row: X402LedgerRow): string {
  if (row.type === 'TOP_UP') return 'Top-up'
  if (row.type === 'REFUND') return 'Refund'
  return row.action ?? 'Charge'
}

/** Recent TOP_UP / CHARGE / REFUND list for Settings → Billing → Payments. */
export function PaymentsLedger({ rows }: { rows: X402LedgerRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-[var(--color-text-tertiary)]">
        No payment activity yet. Purchase credits to get started.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-[var(--color-border-faint)] rounded-lg border border-[var(--color-border-soft)]">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]"
        >
          <div className="min-w-0">
            <p className="text-[var(--color-text-primary)] truncate">{label(row)}</p>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              {new Date(row.createdAt).toLocaleString()}
            </p>
          </div>
          <span
            className={`font-mono tabular-nums shrink-0 ${
              row.amountUsd >= 0 ? 'text-emerald-400' : 'text-[var(--color-text-secondary)]'
            }`}
          >
            {row.amountUsd >= 0 ? '+' : '−'}
            {fmtUsd(row.amountUsd)}
          </span>
        </li>
      ))}
    </ul>
  )
}

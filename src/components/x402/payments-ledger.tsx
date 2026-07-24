import { useMemo } from 'react'
import {
  isPaymentTxHash,
  type X402LedgerRow,
} from '../../stores/x402-store'

function fmtUsd(n: number): string {
  return `$${Math.abs(n).toFixed(n !== 0 && Math.abs(n) < 1 ? 4 : 2)}`
}

/** Truncate a 0x tx hash for the table (X-style). */
function shortTx(hash: string): string {
  const h = hash.toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(h)) {
    return h.length > 10 ? `${h.slice(0, 1)}…${h.slice(-4)}` : h
  }
  return `${h.slice(0, 6)}…${h.slice(-4)}`
}

function fmtDateUtc(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return (
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    }) + ' UTC'
  )
}

function basescanTxUrl(hash: string, chainId = 8453): string {
  if (chainId === 8453) return `https://basescan.org/tx/${hash}`
  return `https://basescan.org/tx/${hash}`
}

function paymentKey(row: X402LedgerRow): string | null {
  const id = row.paymentId ?? row.id
  return isPaymentTxHash(id) ? id.toLowerCase() : null
}

/**
 * Inbound credits with a verifiable payment id only (USDC tx hash).
 * Legacy TOP_UP rows without a hash are omitted — they can't be reconciled.
 */
function inboundPaymentRows(rows: X402LedgerRow[]): X402LedgerRow[] {
  return rows.filter((r) => {
    if (r.type !== 'TOP_UP' && r.type !== 'REFUND') return false
    if (r.type === 'TOP_UP') return paymentKey(r) != null
    // Refunds may lack a tx; still show as inbound credits.
    return true
  })
}

/**
 * Settings → Billing → Payments: inbound credits keyed by on-chain payment id.
 */
export function PaymentsLedger({ rows }: { rows: X402LedgerRow[] }) {
  const inbound = useMemo(() => inboundPaymentRows(rows), [rows])

  if (inbound.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-[var(--color-text-tertiary)]">
          View billing transactions that added credits to your balance.
        </p>
        <p className="text-[13px] text-[var(--color-text-tertiary)]">
          No purchases yet. Purchase credits to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--color-text-tertiary)]">
        View billing transactions that added credits to your balance.
      </p>
      <div className="rounded-lg border border-[var(--color-border-soft)] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border-faint)] text-left text-[11px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
              <th className="px-3.5 py-2.5 font-medium">Transaction</th>
              <th className="px-3.5 py-2.5 font-medium">Status</th>
              <th className="px-3.5 py-2.5 font-medium">Method</th>
              <th className="px-3.5 py-2.5 font-medium text-right">Amount</th>
              <th className="px-3.5 py-2.5 font-medium text-right">Date</th>
              <th className="px-3.5 py-2.5 font-medium text-right">
                <span className="sr-only">Explorer</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-faint)]">
            {inbound.map((row) => {
              const hash = paymentKey(row)
              const method =
                row.type === 'REFUND'
                  ? 'Refund'
                  : `${row.asset ?? 'USDC'} · Base`
              return (
                <tr key={row.id}>
                  <td className="px-3.5 py-2.5 font-mono text-[12px] text-[var(--color-text-secondary)]">
                    {hash ? shortTx(hash) : shortTx(row.id)}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="text-emerald-400">Succeeded</span>
                  </td>
                  <td className="px-3.5 py-2.5 text-[var(--color-text-secondary)]">
                    {method}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-medium text-[var(--color-text-primary)]">
                    {fmtUsd(row.amountUsd)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-[12px] text-[var(--color-text-tertiary)] whitespace-nowrap">
                    {fmtDateUtc(row.createdAt)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    {hash ? (
                      <a
                        href={basescanTxUrl(hash, row.chainId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                        aria-label="View on Basescan"
                        title="View on Basescan"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

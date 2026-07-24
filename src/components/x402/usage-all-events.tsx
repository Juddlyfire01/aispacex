import type { AllEventsRow } from '../../lib/cost/usage-analytics'

function fmtDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** All Events — breakdown by UTC day × kind × profile. */
export function UsageAllEvents({ rows }: { rows: AllEventsRow[] }) {
  return (
    <section>
      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">All Events</h3>
      <p className="text-[13px] text-[var(--color-text-tertiary)] mt-0.5 mb-4">
        Breakdown of all requests by type and profile
      </p>

      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--color-text-tertiary)]">
          No usage recorded in the last 30 days.
        </p>
      ) : (
        <div className="rounded-lg border border-[var(--color-border-soft)] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border-faint)] text-left text-[11px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                <th className="px-3.5 py-2.5 font-medium">
                  Date <span aria-hidden="true">↓</span>
                </th>
                <th className="px-3.5 py-2.5 font-medium">Profile</th>
                <th className="px-3.5 py-2.5 font-medium">Kind</th>
                <th className="px-3.5 py-2.5 font-medium text-right">Requests</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-faint)]">
              {rows.map((row) => (
                <tr key={`${row.day}-${row.profile}-${row.kind}`}>
                  <td className="px-3.5 py-2.5 text-[var(--color-text-secondary)] tabular-nums">
                    {fmtDay(row.day)}
                  </td>
                  <td className="px-3.5 py-2.5 text-[var(--color-text-primary)] truncate max-w-[10rem]">
                    {row.profile}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="inline-flex items-center rounded-full border border-[var(--color-border-soft)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                      {row.label}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">
                    {row.requests}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

import { formatTokens } from '../utils'

export function fmtUsd(n: number, digits = 2): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(digits)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(digits)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(digits)}K`
  if (abs >= 100) return `${sign}$${abs.toFixed(2)}`
  if (abs >= 1) return `${sign}$${abs.toFixed(digits)}`
  return `${sign}$${abs.toFixed(4)}`
}

/** Full dollar amount for a single token/unit price (no K/M/B shorthand). */
export function fmtUnitUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 100) {
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

export function fmtPct(n: number, signed = true): string {
  const sign = signed && n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function fmtRatio(n: number): string {
  return `${(n * 100).toFixed(2)}%`
}

export function fmtToken(n: number, suffix?: string, digits?: number): string {
  let base: string
  if (digits != null) {
    const abs = Math.abs(n)
    const sign = n < 0 ? '-' : ''
    if (abs >= 1_000_000) base = `${sign}${(abs / 1_000_000).toFixed(digits)}M`
    else if (abs >= 1_000) base = `${sign}${(abs / 1_000).toFixed(digits)}K`
    else base = `${sign}${abs.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
  } else {
    base = formatTokens(n)
  }
  return suffix ? `${base} ${suffix}` : base
}

/** Compact plain-number formatting — 48.9M, 1.2K, 847. */
export function fmtCompact(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(digits)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(digits)}M`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(digits)}K`
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

/** Relative time for feed items — "3h ago", "2d ago". */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function relUpdated(iso: string | null | undefined): string {
  if (!iso) return 'unknown'
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Compact axis labels — avoids wide numbers crowding the chart gutter. */
export function fmtChartAxis(n: number, opts?: { prefix?: string; suffix?: string; pct?: boolean; range?: number }): string {
  if (!Number.isFinite(n)) return '—'
  const { prefix = '', suffix = '', pct = false, range } = opts ?? {}
  if (pct) {
    const pctVal = n * 100
    const span = range != null ? range * 100 : Math.abs(pctVal)
    const digits = span < 0.5 ? 2 : span < 5 ? 1 : 0
    return `${pctVal.toFixed(digits)}%`
  }
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const span = range ?? abs
  let body: string
  if (abs >= 1e9) body = `${(abs / 1e9).toFixed(span < 5e8 ? 2 : 1)}B`
  else if (abs >= 1e6) body = `${(abs / 1e6).toFixed(span < 5e5 ? 2 : 1)}M`
  else if (abs >= 1e4) body = `${(abs / 1e3).toFixed(span < 5e3 ? 1 : 0)}K`
  else if (abs >= 1e3) body = `${(abs / 1e3).toFixed(span < 50 ? 2 : 1)}K`
  else if (abs >= 100) body = abs.toFixed(span < 50 ? 1 : 0)
  else if (abs >= 1) body = abs.toFixed(span < 0.5 ? 3 : span < 5 ? 2 : 1)
  else if (abs >= 0.01) body = abs.toFixed(span < 0.05 ? 4 : 3)
  else body = abs.toFixed(4)
  return `${sign}${prefix}${body}${suffix}`
}

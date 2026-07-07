import type { BuzzMetrics, SocialMetrics } from '../../lib/venicestats/signal-types'
import { fmtCompact, fmtPct } from '../../lib/venicestats/format'
import { KpiCard } from '../x-intel/stats/stats-ui'
import { cn } from '../../lib/utils'

/**
 * Week-over-week pulse computed from the buzz metrics series.
 * The trailing week is partial, so deltas compare the last FULL week to the
 * one before it (series[-2] vs series[-3]).
 */
export function computePulse(m: BuzzMetrics) {
  const mentions = m.mentionsByWeek
  const views = m.viewsByWeek
  const lastFull = mentions.length >= 2 ? mentions[mentions.length - 2] : undefined
  const prevFull = mentions.length >= 3 ? mentions[mentions.length - 3] : undefined
  const lastFullViews = views.length >= 2 ? views[views.length - 2] : undefined

  const wow =
    lastFull && prevFull && prevFull.v > 0
      ? ((lastFull.v - prevFull.v) / prevFull.v) * 100
      : null

  const mood: 'heating' | 'cooling' | 'steady' =
    wow == null ? 'steady' : wow > 10 ? 'heating' : wow < -10 ? 'cooling' : 'steady'

  return {
    mentionsLastWeek: lastFull?.v ?? null,
    mentionsWoW: wow,
    reachLastWeek: lastFullViews?.v ?? null,
    mood,
  }
}

const MOOD_META = {
  heating: { label: 'Heating up', cls: 'text-orange-400 border-orange-400/30 bg-orange-400/[0.08]' },
  cooling: { label: 'Cooling', cls: 'text-sky-400 border-sky-400/30 bg-sky-400/[0.08]' },
  steady: { label: 'Steady', cls: 'text-[var(--color-text-secondary)] border-[var(--color-border-soft)] bg-transparent' },
} as const

export function MoodBadge({ mood }: { mood: keyof typeof MOOD_META }) {
  const meta = MOOD_META[mood]
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em]', meta.cls)}>
      {meta.label}
    </span>
  )
}

export function PulseStrip({ m, social }: { m: BuzzMetrics; social: SocialMetrics | undefined }) {
  const pulse = computePulse(m)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <KpiCard
        label="Mentions (last wk)"
        value={pulse.mentionsLastWeek != null ? fmtCompact(pulse.mentionsLastWeek, 1) : '—'}
        delta={
          pulse.mentionsWoW != null
            ? { text: `${fmtPct(pulse.mentionsWoW)} WoW`, positive: pulse.mentionsWoW > 0 ? true : pulse.mentionsWoW < 0 ? false : undefined }
            : undefined
        }
        tip="Venice mentions on X during the last full week, vs the week before."
      />
      <KpiCard
        label="Reach (last wk)"
        value={pulse.reachLastWeek != null ? fmtCompact(pulse.reachLastWeek, 1) : '—'}
        sub="post views"
        tip="Total views across Venice mentions during the last full week."
      />
      <KpiCard
        label="Sentiment"
        value={social?.sentimentUpPct != null ? `${social.sentimentUpPct.toFixed(0)}% bullish` : '—'}
        sub={social?.marketCapRank != null ? `VVV rank #${social.marketCapRank}` : undefined}
        tip="CoinGecko community sentiment for VVV and its market cap rank."
      />
      <KpiCard
        label="Total mentions"
        value={fmtCompact(m.totalMentions, 1)}
        sub={`${fmtCompact(m.uniqueAuthors, 1)} authors · ${fmtCompact(m.totalViews, 1)} views`}
        tip="All-time tracked Venice mentions, unique authors, and cumulative views."
      />
    </div>
  )
}

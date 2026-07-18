import { cn } from '../../lib/utils'
import type { ActivitySummary } from '../../lib/x-intel/activity'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STYLE_LABEL: Record<ActivitySummary['style'], string> = {
  broadcasting: 'Broadcasting',
  conversational: 'Conversational',
  amplifying: 'Amplifying',
  mixed: 'Mixed',
}

function relTime(ms: number | null): string {
  if (ms == null) return 'unknown'
  const diff = Date.now() - ms
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`
}

/** Green <24h, amber <7d, grey older/unknown — a quick recency read. */
function dotClass(ms: number | null): string {
  if (ms == null) return 'bg-[var(--color-border-faint)]'
  const h = (Date.now() - ms) / 3_600_000
  if (h < 24) return 'bg-green-400/70'
  if (h < 24 * 7) return 'bg-amber-400/70'
  return 'bg-[var(--color-border-faint)]'
}

function gapLabel(hours: number): string {
  if (hours >= 48) return `${Math.round(hours / 24)}d`
  if (hours >= 1) return `${Math.round(hours)}h`
  return '<1h'
}

/**
 * At-a-glance activity / situational awareness for a subject. Every line is
 * grounded in a real timestamp (see computeActivity). Renders nothing when we
 * have no timestamped signal at all.
 */
export function ActivityGlance({ activity }: { activity: ActivitySummary | null }) {
  if (!activity) return null
  const a = activity
  const hasSignal = a.lastActiveMs != null || a.postsLast30d > 0 || a.hasInbound
  if (!hasSignal) return null

  return (
    <div className="pt-3 border-t border-[var(--color-border-faint)] space-y-1.5">
      <span className="text-[10px] font-medium text-[var(--color-text-quaternary)] uppercase tracking-[0.08em]">Activity</span>

      {/* Last active (last public post — not presence) */}
      <div className="flex items-center gap-1.5" title="Last public post/reply/repost — X has no true 'last online'">
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotClass(a.lastActiveMs))} />
        <span className="text-[11px] text-[var(--color-text-secondary)]">
          {a.lastActiveMs != null ? <>Last active <b className="text-[var(--color-text-secondary)] font-medium">{relTime(a.lastActiveMs)}</b></> : 'No posts on record'}
        </span>
      </div>

      {/* Volume (how MUCH they post) */}
      {a.postsLast30d > 0 && (
        <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono">
          {a.postsLast7d} post{a.postsLast7d === 1 ? '' : 's'}/7d · {a.activeDaysLast7}/7 active days
        </p>
      )}

      {/* Trend vs their own norm — amber when shifting, neutral when stable */}
      {a.postsLast30d > 0 && (
        <p className="text-[10px] font-mono" title="Recent posting pace vs this account's own baseline">
          {a.tempo === 'up' && <span className="text-amber-300/80">↑ Busier than usual</span>}
          {a.tempo === 'down' && <span className="text-amber-300/80">↓ Quieter than usual</span>}
          {a.tempo === 'steady' && <span className="text-[var(--color-text-tertiary)]">— Stable activity</span>}
        </p>
      )}

      {/* Rhythm (how CONSISTENTLY, and when, they post) */}
      {a.postsLast30d > 0 && (
        <p className="text-[10px] text-[var(--color-text-quaternary)] font-mono">
          {a.pattern === 'burst' ? 'bursty' : 'steady'} rhythm
          {a.peakHourUtc != null && <> · peak {String(a.peakHourUtc).padStart(2, '0')}:00 UTC</>}
          {a.busiestWeekday != null && <> · busiest {WEEKDAYS[a.busiestWeekday]}</>}
          {a.longestGapHours > 0 && <> · gaps up to {gapLabel(a.longestGapHours)}</>}
        </p>
      )}

      {/* Style — how posting breaks down: originals vs replies vs reposts */}
      {a.postsLast30d > 0 && (
        <p className="text-[10px] text-[var(--color-text-quaternary)] font-mono" title="Share of gathered posts that are originals, replies, or reposts/quotes">
          <span className="text-[var(--color-text-tertiary)]">{STYLE_LABEL[a.style]}</span> · {a.composition.original}% orig · {a.composition.reply}% reply · {a.composition.reposts}% reposts
        </p>
      )}

      {/* Inbound mentions (targets — self gathers none today) */}
      {a.hasInbound && (
        <p className="text-[10px] text-[var(--color-text-quaternary)] font-mono">
          {a.mentionsLast7d} mention{a.mentionsLast7d === 1 ? '' : 's'} received/7d
          {a.lastMentionMs != null && <> · last {relTime(a.lastMentionMs)}</>}
        </p>
      )}
    </div>
  )
}

import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { useModels } from '../../hooks/use-models'
import { SectionRefresh, SectionEmpty, sectionActionBtnCls } from './section-actions'
import { ActivityGlance } from './activity-glance'
import { VerifiedBadge } from './verified-badge'
import { Checkbox } from '../ui/checkbox'
import { RAIL_FOOTER_CLASS, RAIL_FOOTER_ROW_CLASS } from '../layout/rail-footer'
import { formatTokens, cn } from '../../lib/utils'
import { computeAnalytics } from '../../lib/x-intel/analytics'
import { partitionPosts } from '../../lib/x-intel/activity'
import { buildReportMessages } from '../../lib/x-intel/synthesize'
import { estimateMessagesTokens } from '../../lib/x-intel/token-estimate'
import { resolveDefaultSynthesisModel, syncSynthesisModelGlobally } from '../../lib/x-intel/sync-synthesis-model'
import type { Profile, Post, Edge, SynthesisSettings, IntelReportSnapshot } from '../../lib/x-intel/types'
import type { ActivitySummary } from '../../lib/x-intel/activity'

export interface ProfileOverviewProps {
  /** Shaped profile, or null to render the actionable empty state. */
  profile: Profile | null
  /** Whether the X account is connected (gates add-target affordances on self). */
  connected: boolean
  /** Whether refresh/gather actions are enabled (OAuth, or gratis @AskVenice demo). */
  canRefresh?: boolean
  refreshing: boolean
  refreshError: string | null
  lastGatheredIso?: string
  /** Full "everything" pull for this subject. */
  onRefresh: () => void
  /** Empty-state hint copy. */
  emptyHint: string
  /** Bio renderer — differs by surface (targets: add-as-target on mention; self: open on X). */
  renderBio: (profile: Profile) => ReactNode
  /** Self-profile gather extras appended after X-order stats. */
  gatherExtras?: { bookmarks: number; likes: number }
  /** At-a-glance activity summary (shared self/target). */
  activity: ActivitySummary | null
  synthesisSettings: SynthesisSettings
  onSynthesisChange: (patch: Partial<SynthesisSettings>) => void
  /** Number of posts currently gathered — drives the dynamic "MAX" context cap. */
  postCount: number
  /** Gathered posts — used to build the live token estimate for the next report. */
  posts: Post[]
  /** Network edges — needed so the estimate's analytics match the real payload. */
  edges: Edge[]
  /** Prior report snapshots — selectable as narrative context for the next report. */
  reportHistory: IntelReportSnapshot[]
  /** Fixed footer action — self: disconnect OAuth; targets: remove from rail. */
  footerAction?: { label: string; onClick: () => void }
}

const GearIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)

function hiResAvatar(url: string): string {
  return url.replace('_normal', '_400x400')
}

function bannerImageSrc(url: string): string {
  if (/\/profile_banners\//.test(url) && !/\/\d+x\d+$/.test(url)) return `${url}/600x200`
  return url
}

function formatJoined(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `Joined ${d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
}

function ProfileStat({ value, label, capitalize }: { value: string; label: string; capitalize?: boolean }) {
  return (
    <span className="text-[11px] text-white/30">
      <b className="text-white/80 font-semibold">{value}</b>
      {' '}
      <span className={capitalize ? 'capitalize' : undefined}>{label}</span>
    </span>
  )
}

const BotIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-white/35 shrink-0">
    <path d="M17 8h1a4 4 0 010 8h-1v1a2 2 0 01-2 2H8a2 2 0 01-2-2v-1H5a4 4 0 110-8h1V6a4 4 0 014-4h6a4 4 0 014 4v2zM9 6v2h6V6a2 2 0 00-2-2h-2a2 2 0 00-2 2zm-1 8a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
  </svg>
)

/**
 * Sentinel context-cap value meaning "process every gathered post". Stored
 * instead of a fixed number so the cap stays at MAX as more posts arrive on
 * later gathers — synthesize slices posts.slice(0, contextCap), so an
 * effectively-unbounded value simply takes them all.
 */
const MAX_CONTEXT = 100_000

/**
 * Context-cap slider with a dynamic ceiling. The top of the track is the number
 * of gathered posts (step 1); dragging fully right stores the MAX sentinel and
 * labels it "MAX" so the run always covers every available post. When fewer
 * posts are gathered than the current cap, the cap already covers them all, so
 * it reads as MAX too.
 */
function ContextCapControl({ value, postCount, onChange }: {
  value: number
  postCount: number
  onChange: (v: number) => void
}) {
  const ceiling = postCount > 0 ? postCount : 200
  const sliderMin = Math.min(10, ceiling)
  const sliderMax = Math.max(ceiling, sliderMin)
  const isMax = value >= ceiling
  const sliderValue = Math.min(value, sliderMax)
  return (
    <label className="block text-[11px] text-white/40">
      Context cap:{' '}
      {isMax
        ? <b className="text-white/70 font-mono">MAX</b>
        : <><b className="text-white/70 font-mono">{value}</b> posts</>}
      {isMax && postCount > 0 && (
        <span className="text-white/25"> · all {postCount} posts</span>
      )}
      <input
        type="range" min={sliderMin} max={sliderMax} step={1}
        value={sliderValue}
        onChange={(e) => {
          const v = Number(e.target.value)
          onChange(v >= sliderMax ? MAX_CONTEXT : v)
        }}
        className="w-full accent-white mt-1"
      />
    </label>
  )
}

/**
 * Prior-report context selector. Lets the user feed none / all / a custom subset
 * of earlier reports into the next synthesis as narrative context (the model
 * builds on them). Selection persists in synthesisSettings.includedReportIds.
 * Stale ids (reports since deleted) are ignored by the orchestrator, but we also
 * reconcile "all" against the live list here.
 */
function ReportContextSelector({ reportHistory, includedIds, onChange }: {
  reportHistory: IntelReportSnapshot[]
  includedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (reportHistory.length === 0) {
    return (
      <div className="text-[11px] text-white/40">
        Prior-report context
        <p className="text-[10px] text-white/20 mt-0.5">No earlier reports yet — the first report is always a fresh baseline.</p>
      </div>
    )
  }
  const selectedSet = new Set(includedIds)
  const selectedCount = reportHistory.filter((r) => selectedSet.has(r.id)).length
  const allIds = reportHistory.map((r) => r.id)
  const summary = selectedCount === 0 ? 'None' : selectedCount === reportHistory.length ? 'All' : `${selectedCount} selected`

  const toggle = (id: string) => {
    const next = new Set(selectedSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(allIds.filter((x) => next.has(x)))
  }

  return (
    <div className="text-[11px] text-white/40">
      <div className="flex items-center justify-between">
        <span title="Feed earlier reports into the next synthesis as narrative context so it builds on prior analysis.">
          Prior-report context
        </span>
        <span className="font-mono text-white/60">{summary}</span>
      </div>
      <div className="flex gap-1 mt-1">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn('flex-1 rounded-md border px-2 py-1 text-[10px] transition-colors',
            selectedCount === 0 ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/[0.08] text-white/70' : 'border-white/[0.08] text-white/40 hover:text-white/60')}
        >
          None
        </button>
        <button
          type="button"
          onClick={() => onChange(allIds)}
          className={cn('flex-1 rounded-md border px-2 py-1 text-[10px] transition-colors',
            selectedCount === reportHistory.length ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/[0.08] text-white/70' : 'border-white/[0.08] text-white/40 hover:text-white/60')}
        >
          All ({reportHistory.length})
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn('flex-1 rounded-md border px-2 py-1 text-[10px] transition-colors',
            expanded ? 'border-white/25 text-white/70' : 'border-white/[0.08] text-white/40 hover:text-white/60')}
        >
          Custom
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 space-y-1 max-h-[12rem] overflow-y-auto pr-1 border-l border-white/[0.06] pl-2">
          {reportHistory.map((r, i) => {
            const checked = selectedSet.has(r.id)
            return (
              <label key={r.id} className="flex items-center gap-2 cursor-pointer text-[10px] text-white/50 hover:text-white/70">
                <Checkbox checked={checked} onChange={() => toggle(r.id)} />
                <span className="font-mono whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                <span className="text-white/25 truncate">
                  {r.meta.postCount}p{i === reportHistory.length - 1 ? ' · baseline' : ''}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Shared identity / overview column for a single X subject — used by both the
 * self Profile tab and the Targets tab so the two stay visually identical.
 * Order: refresh bar → banner + avatar → identity (X order) → stats → activity →
 * synthesis settings → footer. Self appends bookmarks/likes to stats via gatherExtras.
 */
export function ProfileOverview({
  profile, connected, canRefresh = connected, refreshing, refreshError, lastGatheredIso, onRefresh,
  emptyHint, renderBio, gatherExtras, activity,
  synthesisSettings, onSynthesisChange, footerAction, postCount,
  posts, edges, reportHistory,
}: ProfileOverviewProps) {
  const { data: models } = useModels('text')
  const [settingsOpen, setSettingsOpen] = useState(true)

  useEffect(() => {
    if (!models?.length) return
    resolveDefaultSynthesisModel(models)
  }, [models])

  const handleSynthesisChange = (patch: Partial<SynthesisSettings>) => {
    if (patch.model !== undefined) {
      syncSynthesisModelGlobally(patch.model)
      return
    }
    onSynthesisChange(patch)
  }

  // Live payload estimate for the NEXT report. Rebuilds the exact main-call chat
  // messages (via the shared buildReportMessages) so the number tracks what will
  // actually ship, then estimates tokens heuristically. This is an ESTIMATE — the
  // real, exact count is logged per-report after the call returns.
  const includedIds = synthesisSettings.includedReportIds ?? []
  const estTokens = useMemo(() => {
    if (!profile || posts.length === 0) return 0
    const analytics = computeAnalytics(profile, posts, edges)
    const { own } = partitionPosts(profile, posts)
    const includedSet = new Set(includedIds)
    const includedReports = reportHistory.filter((r) => includedSet.has(r.id))
    const messages = buildReportMessages({
      profile,
      ownPosts: own,
      analytics,
      inboundCount: posts.length - own.length,
      includedReports,
      settings: synthesisSettings,
    })
    return estimateMessagesTokens(messages)
  }, [profile, posts, edges, reportHistory, synthesisSettings, includedIds])

  const actionFooter = footerAction ? (
    <div className={RAIL_FOOTER_CLASS}>
      <div className={cn(RAIL_FOOTER_ROW_CLASS, 'justify-end')}>
        <button type="button" onClick={footerAction.onClick} className={sectionActionBtnCls}>
          {footerAction.label}
        </button>
      </div>
    </div>
  ) : null

  if (!profile) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SectionEmpty
            title="No profile gathered yet"
            hint={emptyHint}
            actionLabel="Refresh profile"
            onAction={onRefresh}
            busy={refreshing}
            disabled={!canRefresh}
            error={refreshError}
          />
        </div>
        {actionFooter}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Refresh bar */}
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.04]">
        <SectionRefresh
          layout="bar"
          label="Refresh profile"
          onClick={onRefresh}
          busy={refreshing}
          disabled={!canRefresh}
          lastGatheredIso={lastGatheredIso}
          error={refreshError}
        />
      </div>

      {/* Banner */}
      <div className="relative h-[88px] bg-[#17202a]">
        {profile.bannerUrl && (
          <img
            src={bannerImageSrc(profile.bannerUrl)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>

      {/* Avatar overlapping banner */}
      <div className="px-5 relative -mt-[26px]">
        {profile.avatarUrl && (
          <img
            src={hiResAvatar(profile.avatarUrl)}
            alt=""
            className="w-14 h-14 rounded-full border-4 border-[var(--color-bg-base)] bg-[var(--color-bg-base)] object-cover"
          />
        )}
      </div>

      <div className="px-5 pb-4 pt-2 space-y-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold text-white/90 truncate">{profile.displayName}</h2>
            {profile.verified.type && <VerifiedBadge type={profile.verified.type} />}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">@{profile.username}</div>
          {profile.automatedBy && (
            <div className="flex items-center gap-1.5 text-[11px] text-white/40 mt-1.5">
              <BotIcon />
              <span>
                Automated by{' '}
                <a
                  href={`https://x.com/${profile.automatedBy.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-accent)] hover:underline"
                >
                  @{profile.automatedBy.username}
                </a>
              </span>
            </div>
          )}
        </div>

        {profile.bio && renderBio(profile)}

        {(profile.location || profile.website || profile.accountCreated) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/35">
            {profile.location && <span>{profile.location}</span>}
            {profile.website && (
              <a
                href={profile.website.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-[var(--color-accent)] hover:underline"
              >
                {profile.website.display}
              </a>
            )}
            {profile.accountCreated && <span>{formatJoined(profile.accountCreated)}</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <ProfileStat value={formatTokens(profile.metrics.following)} label="Following" capitalize />
          <ProfileStat value={formatTokens(profile.metrics.followers)} label="Followers" capitalize />
          <ProfileStat value={formatTokens(profile.metrics.posts)} label="posts" />
          <ProfileStat value={formatTokens(profile.metrics.listed)} label="listed" />
          {gatherExtras && (
            <>
              <ProfileStat value={formatTokens(gatherExtras.bookmarks)} label="bookmarks" />
              <ProfileStat value={formatTokens(gatherExtras.likes)} label="likes gathered" />
            </>
          )}
        </div>
      </div>

      <div className="px-5 pb-4 space-y-4">
      {/* At-a-glance activity / situational awareness */}
      <ActivityGlance activity={activity} />

      {/* Synthesis settings — collapsible, open by default */}
      <div className="pt-3 border-t border-white/[0.04] space-y-2">
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          aria-expanded={settingsOpen}
          className="flex items-center gap-1.5 w-full text-[10px] font-medium text-white/25 hover:text-white/45 uppercase tracking-[0.08em] transition-colors"
        >
          <GearIcon />
          Synthesis settings
          <svg
            width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round"
            className={cn('ml-auto transition-transform', settingsOpen && 'rotate-90')}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        {settingsOpen && (
          <div className="border border-[var(--color-border-faint)] rounded-lg p-3 bg-[var(--color-bg-raised)] space-y-3">
            <label className="block text-[11px] text-white/40">
              Model
              <select
                value={synthesisSettings.model}
                onChange={(e) => handleSynthesisChange({ model: e.target.value })}
                className="w-full mt-1 bg-[var(--color-bg-input)] border border-[var(--color-border-soft)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-secondary)] outline-none"
              >
                {(models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.model_spec?.name || m.id}</option>
                ))}
                {!models?.some((m) => m.id === synthesisSettings.model) && (
                  <option value={synthesisSettings.model}>{synthesisSettings.model}</option>
                )}
              </select>
            </label>
            <ContextCapControl
              value={synthesisSettings.contextCap}
              postCount={postCount}
              onChange={(contextCap) => handleSynthesisChange({ contextCap })}
            />
            <label className="block text-[11px] text-white/40">
              Temperature: <b className="text-white/70 font-mono">{synthesisSettings.temperature.toFixed(1)}</b>
              <input
                type="range" min={0} max={1} step={0.1}
                value={synthesisSettings.temperature}
                onChange={(e) => handleSynthesisChange({ temperature: Number(e.target.value) })}
                className="w-full accent-white mt-1"
              />
            </label>

            <ReportContextSelector
              reportHistory={reportHistory}
              includedIds={includedIds}
              onChange={(ids) => handleSynthesisChange({ includedReportIds: ids })}
            />

            {/* Live payload estimate — approximate, pre-send. */}
            <div className="flex items-baseline justify-between border-t border-white/[0.05] pt-2 text-[11px]">
              <span className="text-white/40" title="Heuristic estimate of the input payload for the next report. The exact count is logged per report after it runs.">
                Est. payload
              </span>
              <span className="font-mono text-white/60">
                {estTokens > 0 ? `~${formatTokens(estTokens)} tok` : '—'}
              </span>
            </div>
          </div>
        )}
      </div>
      </div>
      </div>
      {actionFooter}
    </div>
  )
}

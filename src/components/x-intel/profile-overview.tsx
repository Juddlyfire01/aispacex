import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react'
import { useModels } from '../../hooks/use-models'
import { usePreserveScroll } from '../../hooks/use-preserve-scroll'
import { SectionRefresh, SectionEmpty, sectionActionBtnCls } from './section-actions'
import { ActivityGlance } from './activity-glance'
import { VerifiedBadge, AffiliationBadge } from './verified-badge'
import { Checkbox } from '../ui/checkbox'
import { Tooltip } from '../ui/tooltip'
import { RAIL_FOOTER_CLASS, RAIL_FOOTER_ROW_CLASS } from '../layout/rail-footer'
import { formatTokens, cn } from '../../lib/utils'
import { computeAnalytics } from '../../lib/x-intel/analytics'
import { partitionPosts } from '../../lib/x-intel/activity'
import { buildReportMessages } from '../../lib/x-intel/synthesize'
import { estimateMessagesTokens } from '../../lib/x-intel/token-estimate'
import { resolveDefaultSynthesisModel, syncSynthesisModelGlobally } from '../../lib/x-intel/sync-synthesis-model'
import { resolveSynthesisModelForDisplay } from '../../lib/x-intel/synthesis-model'
import {
  MAX_CONTEXT_CAP,
  type Profile,
  type Post,
  type Edge,
  type SynthesisSettings,
  type IntelReportSnapshot,
} from '../../lib/x-intel/types'
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

function ProfileStat({
  value,
  label,
  tip,
  capitalize,
}: {
  value: string
  label: string
  tip?: string
  capitalize?: boolean
}) {
  return (
    <span className="text-[11px] text-white/30">
      <b className="text-white/80 font-semibold">{value}</b>
      {' '}
      <Tooltip tip={tip}>
        <span className={capitalize ? 'capitalize' : undefined}>{label}</span>
      </Tooltip>
    </span>
  )
}

const BotIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-white/35 shrink-0">
    <path d="M17 8h1a4 4 0 010 8h-1v1a2 2 0 01-2 2H8a2 2 0 01-2-2v-1H5a4 4 0 110-8h1V6a4 4 0 014-4h6a4 4 0 014 4v2zM9 6v2h6V6a2 2 0 00-2-2h-2a2 2 0 00-2 2zm-1 8a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
  </svg>
)

/** Fixed 4-char mono slot so counts stay right-aligned in the header. */
function CapValue({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block w-[4ch] text-right font-mono tabular-nums text-white/70 font-semibold">
      {children}
    </span>
  )
}

/**
 * Labels under a range track: min label left, MAX right, and when the value is
 * between the ends the current number sits under the thumb.
 */
function SliderTrackLabels({
  min,
  max,
  value,
  minLabel,
  midLabel,
}: {
  min: number
  max: number
  value: number
  minLabel: string
  /** Override mid label (defaults to the numeric value). */
  midLabel?: string
}) {
  const range = max - min
  const pct = range <= 0 ? 0 : ((value - min) / range) * 100
  const atMin = value <= min
  const atMax = value >= max
  const showMid = !atMin && !atMax && range > 0

  return (
    <div className="relative h-3.5 mt-0.5 text-[9px] font-mono tabular-nums text-white/30">
      <span className={cn('absolute left-0', atMin && 'text-white/60')}>{minLabel}</span>
      {showMid && (
        <span
          className="absolute -translate-x-1/2 text-white/60"
          style={{ left: `clamp(1.25rem, ${pct}%, calc(100% - 1.25rem))` }}
        >
          {midLabel ?? value}
        </span>
      )}
      <span className={cn('absolute right-0', atMax && 'text-white/60')}>MAX</span>
    </div>
  )
}

/**
 * Context-cap slider with a dynamic ceiling. The top of the track is the number
 * of gathered posts (step 1); dragging fully right stores the MAX sentinel.
 * Header shows the count; under-track labels are None · value · MAX.
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
  const displayCount = isMax ? ceiling : value
  return (
    <label className="block text-[11px] text-white/40">
      <span className="flex items-baseline justify-between gap-2">
        <span title="How many gathered posts to feed into the next report.">
          Post context cap
        </span>
        <CapValue>{displayCount}</CapValue>
      </span>
      <input
        type="range" min={sliderMin} max={sliderMax} step={1}
        value={sliderValue}
        onChange={(e) => {
          const v = Number(e.target.value)
          onChange(v >= sliderMax ? MAX_CONTEXT_CAP : v)
        }}
        className="w-full mt-1"
      />
      <SliderTrackLabels
        min={sliderMin}
        max={sliderMax}
        value={sliderValue}
        minLabel="None"
      />
    </label>
  )
}

/** Newest-first report ids — slider “N” means the N most recent priors. */
function mostRecentReportIds(reportHistory: IntelReportSnapshot[], n: number): string[] {
  if (n <= 0) return []
  return [...reportHistory]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n)
    .map((r) => r.id)
}

/** Largest k where selection equals the k most recent reports; null if custom. */
function matchingRecentCount(reportHistory: IntelReportSnapshot[], includedIds: string[]): number | null {
  const selected = new Set(includedIds.filter((id) => reportHistory.some((r) => r.id === id)))
  if (selected.size === 0) return 0
  for (let k = reportHistory.length; k >= 1; k--) {
    const want = mostRecentReportIds(reportHistory, k)
    if (want.length !== selected.size) continue
    if (want.every((id) => selected.has(id))) return k
  }
  return null
}

/**
 * Prior-report context: slider for “most recent N” (0 = none, max = all),
 * plus optional Custom checklist for arbitrary subsets. Selection persists in
 * synthesisSettings.includedReportIds. Empty selection is seeded once to All
 * (default max) when history exists. When at MAX, appendReport grows the list
 * as new reports are generated so the cap stays at MAX.
 */
function ReportContextSelector({ reportHistory, includedIds, onChange }: {
  reportHistory: IntelReportSnapshot[]
  includedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  // Only auto-seed empty → all once; after the user slides to None we leave [].
  const didSeedDefault = useRef(false)

  useEffect(() => {
    if (didSeedDefault.current) return
    if (reportHistory.length === 0) return
    if (includedIds.length > 0) {
      didSeedDefault.current = true
      return
    }
    didSeedDefault.current = true
    onChange(reportHistory.map((r) => r.id))
  }, [reportHistory, includedIds, onChange])

  if (reportHistory.length === 0) {
    return (
      <div className="text-[11px] text-white/40">
        Report context cap
        <p className="text-[10px] text-white/20 mt-0.5">No earlier reports yet — the first report is always a fresh baseline.</p>
      </div>
    )
  }

  const selectedSet = new Set(includedIds)
  const selectedCount = reportHistory.filter((r) => selectedSet.has(r.id)).length
  const maxN = reportHistory.length
  const recentMatch = matchingRecentCount(reportHistory, includedIds)
  const isCustom = recentMatch === null
  const sliderValue = isCustom ? selectedCount : recentMatch

  const setRecentCount = (n: number) => {
    const clamped = Math.max(0, Math.min(maxN, Math.round(n)))
    onChange(mostRecentReportIds(reportHistory, clamped))
  }

  const toggle = (id: string) => {
    const next = new Set(selectedSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Preserve history order for stability; membership is what matters.
    onChange(reportHistory.map((r) => r.id).filter((x) => next.has(x)))
  }

  // Custom list: newest first so it matches the slider’s “recent” mental model.
  const customList = [...reportHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="text-[11px] text-white/40">
      <div className="flex items-baseline justify-between gap-2">
        <span title="Feed earlier reports into the next synthesis as narrative context so it builds on prior analysis.">
          Report context cap
        </span>
        <CapValue>{selectedCount}</CapValue>
      </div>
      <input
        type="range"
        min={0}
        max={maxN}
        step={1}
        value={sliderValue}
        onChange={(e) => setRecentCount(Number(e.target.value))}
        className="w-full mt-1"
        aria-label="Report context count"
      />
      <SliderTrackLabels
        min={0}
        max={maxN}
        value={sliderValue}
        minLabel="None"
        midLabel={isCustom ? `${selectedCount}*` : undefined}
      />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'mt-1.5 w-full rounded-md border px-2 py-1 text-[10px] transition-colors',
          expanded || isCustom
            ? 'border-white/25 text-white/70'
            : 'border-white/[0.08] text-white/40 hover:text-white/60',
        )}
      >
        Custom{isCustom ? ` · ${selectedCount}` : ''}
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1 max-h-[12rem] overflow-y-auto pr-1 border-l border-white/[0.06] pl-2">
          {customList.map((r, i) => {
            const checked = selectedSet.has(r.id)
            const isOldest = i === customList.length - 1
            return (
              <label key={r.id} className="flex items-center gap-2 cursor-pointer text-[10px] text-white/50 hover:text-white/70">
                <Checkbox checked={checked} onChange={() => toggle(r.id)} />
                <span className="font-mono whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                <span className="text-white/25 truncate">
                  {r.meta.postCount}p{isOldest ? ' · baseline' : ''}
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
  // Stay put while refresh rewrites profile/posts; reset only when subject changes.
  const { ref: scrollRef, onScroll } = usePreserveScroll(profile?.id ?? null)

  useEffect(() => {
    if (!models?.length) return
    resolveDefaultSynthesisModel(models)
  }, [models])

  const displayModel = resolveSynthesisModelForDisplay(synthesisSettings.model, models)

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
  const [debouncedSynthesis, setDebouncedSynthesis] = useState(synthesisSettings)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSynthesis(synthesisSettings), 250)
    return () => clearTimeout(t)
  }, [synthesisSettings])

  const estTokens = useMemo(() => {
    if (!profile || posts.length === 0) return 0
    const analytics = computeAnalytics(profile, posts, edges)
    const { own } = partitionPosts(profile, posts)
    const debouncedIncludedIds = debouncedSynthesis.includedReportIds ?? []
    const includedSet = new Set(debouncedIncludedIds)
    const includedReports = reportHistory.filter((r) => includedSet.has(r.id))
    const messages = buildReportMessages({
      profile,
      ownPosts: own,
      analytics,
      inboundCount: posts.length - own.length,
      includedReports,
      settings: debouncedSynthesis,
    })
    return estimateMessagesTokens(messages)
  }, [profile, posts, edges, reportHistory, debouncedSynthesis])

  const actionFooter = footerAction ? (
    <div className={cn(RAIL_FOOTER_CLASS, 'shrink-0')}>
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
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto">
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
            {profile.affiliation && <AffiliationBadge affiliation={profile.affiliation} />}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="text-[11px] text-white/40">@{profile.username}</span>
            {profile.followsYou === true && (
              <span
                className="text-[10px] font-medium text-white/55 bg-white/[0.08] px-1.5 py-0.5 rounded"
                title="This account follows you"
              >
                Follows you
              </span>
            )}
          </div>
          {profile.automatedBy && (
            <div className="flex items-center gap-1.5 text-[11px] text-white/40 mt-1.5">
              <BotIcon />
              <span>
                Automated by{' '}
                <a
                  href={`https://x.com/${profile.automatedBy.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="entity-link"
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
                className="entity-link"
              >
                {profile.website.display}
              </a>
            )}
            {profile.accountCreated && <span>{formatJoined(profile.accountCreated)}</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <ProfileStat
            value={formatTokens(profile.metrics.following)}
            label="Following"
            tip="Accounts this profile follows on X."
            capitalize
          />
          <ProfileStat
            value={formatTokens(profile.metrics.followers)}
            label="Followers"
            tip="Accounts following this profile on X."
            capitalize
          />
          <ProfileStat
            value={formatTokens(profile.metrics.posts)}
            label="posts"
            tip="Lifetime public posts attributed to this profile."
          />
          <ProfileStat
            value={formatTokens(profile.metrics.listed)}
            label="listed"
            tip="Public lists that include this profile."
          />
          {gatherExtras && (
            <>
              <ProfileStat
                value={formatTokens(gatherExtras.bookmarks)}
                label="bookmarks"
                tip="Bookmarked posts gathered for this report window."
              />
              <ProfileStat
                value={formatTokens(gatherExtras.likes)}
                label="likes gathered"
                tip="Liked posts gathered for this report window."
              />
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
          <div className="rounded-lg border border-white/[0.05] bg-[var(--color-bg-card)] p-3 space-y-3">
            <label className="block text-[11px] text-white/40">
              Model
              <select
                value={displayModel}
                onChange={(e) => handleSynthesisChange({ model: e.target.value })}
                disabled={!displayModel && !models?.length}
                className="w-full mt-1 bg-[var(--color-bg-input)] border border-[var(--color-border-soft)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-secondary)] outline-none disabled:opacity-50"
              >
                {!displayModel && (
                  <option value="">Loading models…</option>
                )}
                {(models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.model_spec?.name || m.id}</option>
                ))}
                {displayModel && !models?.some((m) => m.id === displayModel) && (
                  <option value={displayModel}>{displayModel}</option>
                )}
              </select>
            </label>
            <label className="block text-[11px] text-white/40">
              <span className="flex items-baseline justify-between gap-2">
                <span>Temperature</span>
                <CapValue>{synthesisSettings.temperature.toFixed(1)}</CapValue>
              </span>
              <input
                type="range" min={0} max={1} step={0.1}
                value={synthesisSettings.temperature}
                onChange={(e) => handleSynthesisChange({ temperature: Number(e.target.value) })}
                className="w-full mt-1"
              />
            </label>

            <div className="border-t border-white/[0.05]" />

            <ContextCapControl
              value={synthesisSettings.contextCap}
              postCount={postCount}
              onChange={(contextCap) => handleSynthesisChange({ contextCap })}
            />
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

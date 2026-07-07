import type { ReactNode } from 'react'
import { useModels } from '../../hooks/use-models'
import { SectionRefresh, SectionEmpty, sectionActionBtnCls } from './section-actions'
import { ActivityGlance } from './activity-glance'
import { RAIL_FOOTER_CLASS, RAIL_FOOTER_ROW_CLASS } from '../layout/rail-footer'
import { formatTokens, cn } from '../../lib/utils'
import type { Profile, SynthesisSettings } from '../../lib/x-intel/types'
import type { ActivitySummary } from '../../lib/x-intel/activity'

export interface ProfileOverviewProps {
  /** Shaped profile, or null to render the actionable empty state. */
  profile: Profile | null
  /** Whether the X account is connected (gates refresh). */
  connected: boolean
  refreshing: boolean
  refreshError: string | null
  lastGatheredIso?: string
  /** Full "everything" pull for this subject. */
  onRefresh: () => void
  /** Empty-state hint copy. */
  emptyHint: string
  /** "you" pill next to the display name (self view only). */
  showYouBadge?: boolean
  /** Bio renderer — differs by surface (targets: add-as-target on mention; self: open on X). */
  renderBio: (profile: Profile) => ReactNode
  /** Optional extra metrics block (self: bookmarks/likes). Omitted for targets. */
  extraSection?: ReactNode
  /** At-a-glance activity summary (shared self/target). */
  activity: ActivitySummary | null
  synthesisSettings: SynthesisSettings
  onSynthesisChange: (patch: Partial<SynthesisSettings>) => void
  /** Fixed footer action — self: disconnect OAuth; targets: remove from rail. */
  footerAction?: { label: string; onClick: () => void }
}

const GearIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)

/**
 * Shared identity / overview column for a single X subject — used by both the
 * self Profile tab and the Targets tab so the two stay visually identical.
 * Order: refresh bar → identity + metrics → optional extras → latest report →
 * synthesis settings (always open) → fixed footer action. Self carries an extra metrics
 * block (bookmarks/likes) that targets simply omit.
 */
export function ProfileOverview({
  profile, connected, refreshing, refreshError, lastGatheredIso, onRefresh,
  emptyHint, showYouBadge, renderBio, extraSection, activity,
  synthesisSettings, onSynthesisChange, footerAction,
}: ProfileOverviewProps) {
  const { data: models } = useModels('text')

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
            disabled={!connected}
            error={refreshError}
          />
        </div>
        {actionFooter}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
      {/* Refresh bar */}
      <div className="pb-3 border-b border-white/[0.04]">
        <SectionRefresh
          layout="bar"
          label="Refresh profile"
          onClick={onRefresh}
          busy={refreshing}
          disabled={!connected}
          lastGatheredIso={lastGatheredIso}
          error={refreshError}
        />
      </div>

      {/* Header strip */}
      <div className="flex items-start gap-3">
        {profile.avatarUrl && <img src={profile.avatarUrl} alt="" className="w-12 h-12 rounded-full" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold text-white/90 truncate">{profile.displayName}</h2>
            {profile.verified.type && (
              <span
                title={`Verified (${profile.verified.type})`}
                className={cn(
                  'text-[9px] px-1.5 py-px rounded-full font-medium',
                  profile.verified.type === 'blue' && 'bg-blue-400/15 text-blue-300/70',
                  profile.verified.type === 'business' && 'bg-yellow-400/15 text-yellow-300/70',
                  profile.verified.type === 'government' && 'bg-gray-400/15 text-gray-300/70',
                )}
              >
                {profile.verified.type}
              </span>
            )}
            {showYouBadge && (
              <span className="text-[9px] px-1.5 py-px rounded-full font-medium bg-[var(--color-accent)]/15 text-[var(--color-accent)]/80">you</span>
            )}
          </div>
          <div className="text-[11px] text-white/25">
            @{profile.username}
            {profile.location && <> · {profile.location}</>}
            {profile.website && (
              <>
                {' · '}
                <a href={profile.website.href} target="_blank" rel="noopener noreferrer nofollow" className="text-[var(--color-accent)] hover:underline">
                  {profile.website.display}
                </a>
              </>
            )}
            {profile.accountCreated && <> · joined {new Date(profile.accountCreated).getFullYear()}</>}
          </div>
          {profile.bio && renderBio(profile)}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 text-[11px] text-white/30 font-mono">
        <span><b className="text-white/60">{formatTokens(profile.metrics.followers)}</b> followers</span>
        <span><b className="text-white/60">{formatTokens(profile.metrics.following)}</b> following</span>
        <span><b className="text-white/60">{formatTokens(profile.metrics.posts)}</b> posts</span>
        <span><b className="text-white/60">{formatTokens(profile.metrics.listed)}</b> listed</span>
      </div>

      {/* Optional extra metrics (self: bookmarks/likes; targets omit) */}
      {extraSection}

      {/* At-a-glance activity / situational awareness */}
      <ActivityGlance activity={activity} />

      {/* Synthesis settings — always open for quick access */}
      <div className="pt-3 border-t border-white/[0.04] space-y-2">
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-white/25 uppercase tracking-[0.08em]">
          <GearIcon />
          Synthesis settings
        </span>
        <div className="border border-[var(--color-border-faint)] rounded-lg p-3 bg-[var(--color-bg-raised)] space-y-3">
          <label className="block text-[11px] text-white/40">
            Context cap: <b className="text-white/70 font-mono">{synthesisSettings.contextCap}</b> posts
            <input
              type="range" min={10} max={200} step={5}
              value={synthesisSettings.contextCap}
              onChange={(e) => onSynthesisChange({ contextCap: Number(e.target.value) })}
              className="w-full accent-white mt-1"
            />
          </label>
          <label className="block text-[11px] text-white/40">
            Temperature: <b className="text-white/70 font-mono">{synthesisSettings.temperature.toFixed(1)}</b>
            <input
              type="range" min={0} max={1} step={0.1}
              value={synthesisSettings.temperature}
              onChange={(e) => onSynthesisChange({ temperature: Number(e.target.value) })}
              className="w-full accent-white mt-1"
            />
          </label>
          <label className="block text-[11px] text-white/40">
            Model
            <select
              value={synthesisSettings.model}
              onChange={(e) => onSynthesisChange({ model: e.target.value })}
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
        </div>
      </div>
      </div>
      {actionFooter}
    </div>
  )
}

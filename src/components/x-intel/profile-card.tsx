import { useState, useEffect, useRef } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { confirmDialog } from '../../stores/confirm-store'
import { refreshProfile, runGather } from '../../lib/x-intel/orchestrate'
import { withRefreshToast } from '../../lib/x-intel/refresh-toast'
import { linkify } from '../../lib/x-intel/linkify'
import { EthAddressLink } from './eth-address-link'
import { MentionLink } from './mention-link'
import { ensureProfileShape, profileNeedsLinkRefresh } from '../../lib/x-intel/normalize'
import { computeActivity } from '../../lib/x-intel/activity'
import type { Profile } from '../../lib/x-intel/types'
import { ProfileOverview } from './profile-overview'
import { canGatherTarget, isDemoTarget } from '../../lib/x-intel/fields'

/**
 * Render a bio with clickable URLs, @mentions and #hashtags. URLs and hashtags
 * open externally; a mention opens a popover to add the account as an intel
 * target or open its X profile (shared <MentionLink> UX).
 */
function BioText({ text, bioUrls }: { text: string; bioUrls?: { url: string; expanded: string; display: string }[] }) {
  const linkCls = 'entity-link'
  return (
    <p className="text-[12px] text-white/50 mt-1.5 break-words">
      {linkify(text, bioUrls).map((tok, i) => {
        switch (tok.type) {
          case 'url':
            return (
              <a key={i} href={tok.href} target="_blank" rel="noopener noreferrer nofollow" className={linkCls}>
                {tok.value}
              </a>
            )
          case 'mention':
            return <MentionLink key={i} username={tok.username} label={tok.value} />
          case 'hashtag':
            return (
              <a key={i} href={`https://x.com/hashtag/${encodeURIComponent(tok.tag)}`} target="_blank" rel="noopener noreferrer nofollow" className={linkCls}>
                {tok.value}
              </a>
            )
          case 'eth':
            return <EthAddressLink key={i} identity={tok.value} />
          default:
            return <span key={i}>{tok.value}</span>
        }
      })}
    </p>
  )
}

/**
 * Left overview column of the Profile sub-tab for a target. Delegates layout to
 * the shared ProfileOverview so targets and the self Profile tab stay identical;
 * this wrapper only supplies target-specific data sources and handlers.
 */
export function ProfileCard() {
  const activeTarget = useXIntelStore((s) => s.activeTarget)
  const report = useXIntelStore((s) => (s.activeTarget ? s.reports[s.activeTarget] : undefined))
  const gathering = useXIntelStore((s) =>
    s.activeTarget ? Boolean(s.gatheringTargets[s.activeTarget]) : false,
  )
  const updateReport = useXIntelStore((s) => s.updateReport)
  const removeTarget = useXIntelStore((s) => s.removeTarget)
  const connected = useXSelfStore((s) => s.connected)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [profileRefreshing, setProfileRefreshing] = useState(false)
  const linkRefreshAttempted = useRef<Set<string>>(new Set())

  // Refresh always does a full gather (profile + posts + mentions) so newly
  // authored posts land in the store — a profile-only refresh leaves the post
  // corpus frozen and makes reports read "no new activity". A progress toast
  // reports the outcome, including how many new posts were pulled in.
  const runRefresh = async () => {
    if (!activeTarget) return
    setRefreshError(null)
    setProfileRefreshing(true)
    try {
      await withRefreshToast(
        `@${activeTarget}`,
        () => useXIntelStore.getState().reports[activeTarget]?.posts.length ?? 0,
        () => runGather(activeTarget),
        'Profile up to date',
      )
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setProfileRefreshing(false)
    }
  }

  const handleRemove = async () => {
    if (!activeTarget) return
    const ok = await confirmDialog({
      title: 'Remove from rail',
      description: `@${activeTarget} · Gathered data stays encrypted on this device and is revived if you add them again.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    removeTarget(activeTarget)
  }

  const profile = report?.profile ? ensureProfileShape(report.profile) : null

  // Targets persisted before link-entity support lack bioUrls — refresh once per profile id.
  useEffect(() => {
    if (!connected || !activeTarget || !profile || !profileNeedsLinkRefresh(profile)) return
    if (linkRefreshAttempted.current.has(profile.id)) return
    linkRefreshAttempted.current.add(profile.id)
    refreshProfile(activeTarget, { silent: true }).catch(() => {
      linkRefreshAttempted.current.delete(profile.id)
    })
  }, [connected, activeTarget, profile])

  const canGather = canGatherTarget(activeTarget, connected)

  if (!activeTarget || !report) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No profile selected</div>
  }

  const { synthesisSettings } = report
  const activity = profile ? computeActivity(profile, report.posts) : null

  return (
    <ProfileOverview
      profile={profile}
      connected={connected}
      canRefresh={canGather}
      refreshing={gathering || profileRefreshing}
      refreshError={refreshError}
      lastGatheredIso={report.refreshedAt?.profile ?? profile?.gatheredAt}
      onRefresh={runRefresh}
      emptyHint={canGather
        ? (isDemoTarget(activeTarget) && !connected
          ? `Fetch @${activeTarget}'s profile, posts & network — no X account needed. Connect X to analyze anyone else.`
          : `Fetch @${activeTarget}'s profile, posts & network in one pull.`)
        : 'Connect your X account first (header → Connect X).'}
      renderBio={(p: Profile) => <BioText text={p.bio ?? ''} bioUrls={p.bioUrls} />}
      activity={activity}
      synthesisSettings={synthesisSettings}
      postCount={report.posts.length}
      posts={report.posts}
      edges={report.edges}
      reportHistory={report.reportHistory}
      onSynthesisChange={(patch) => updateReport(activeTarget, { synthesisSettings: { ...synthesisSettings, ...patch } })}
      footerAction={{ label: 'Remove profile', onClick: handleRemove }}
    />
  )
}

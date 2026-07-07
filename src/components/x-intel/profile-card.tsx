import { useState, useEffect, useRef } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { refreshProfile, runGather } from '../../lib/x-intel/orchestrate'
import { linkify } from '../../lib/x-intel/linkify'
import { ensureProfileShape, profileNeedsLinkRefresh } from '../../lib/x-intel/normalize'
import { computeActivity } from '../../lib/x-intel/activity'
import { ProfileOverview } from './profile-overview'
import type { Profile } from '../../lib/x-intel/types'

/**
 * Render a bio with clickable URLs, @mentions and #hashtags. URLs and hashtags
 * open externally; a mention is a strong related-account signal, so clicking it
 * offers to add that account as a new intel target (mirrors the network graph).
 */
function BioText({ text, bioUrls }: { text: string; bioUrls?: { url: string; expanded: string; display: string }[] }) {
  const addTarget = useXIntelStore((s) => s.addTarget)
  const connected = useXSelfStore((s) => s.connected)

  const addAsTarget = (username: string) => {
    if (!connected) {
      alert('Connect your X account (header → Connect X) to add targets from a bio mention.')
      return
    }
    if (confirm(`Add @${username} as a new intel target?`)) {
      addTarget(username)
      runGather(username).catch(() => { /* surfaced in target rail */ })
    }
  }

  const linkCls = 'text-[var(--color-accent)] hover:underline'
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
            return (
              <button key={i} type="button" onClick={() => addAsTarget(tok.username)} className={linkCls} title={`Add @${tok.username} as a target`}>
                {tok.value}
              </button>
            )
          case 'hashtag':
            return (
              <a key={i} href={`https://x.com/hashtag/${encodeURIComponent(tok.tag)}`} target="_blank" rel="noopener noreferrer nofollow" className={linkCls}>
                {tok.value}
              </a>
            )
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
  const updateReport = useXIntelStore((s) => s.updateReport)
  const removeTarget = useXIntelStore((s) => s.removeTarget)
  const connected = useXSelfStore((s) => s.connected)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const linkRefreshAttempted = useRef<Set<string>>(new Set())

  const runRefresh = async () => {
    if (!activeTarget) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      await runGather(activeTarget)
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const handleRemove = () => {
    if (!activeTarget) return
    if (!confirm(`Remove @${activeTarget} from the Others rail? Gathered data stays encrypted on this device and is revived if you add them again. Clear it anytime from Settings → Data & privacy.`)) return
    removeTarget(activeTarget)
  }

  const profile = report?.profile ? ensureProfileShape(report.profile) : null

  // Targets persisted before link-entity support lack bioUrls — refresh once per profile id.
  useEffect(() => {
    if (!connected || !activeTarget || !profile || !profileNeedsLinkRefresh(profile)) return
    if (linkRefreshAttempted.current.has(profile.id)) return
    linkRefreshAttempted.current.add(profile.id)
    refreshProfile(activeTarget).catch(() => {
      linkRefreshAttempted.current.delete(profile.id)
    })
  }, [connected, activeTarget, profile])

  if (!activeTarget || !report) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No target selected</div>
  }

  const { synthesisSettings } = report
  const activity = profile ? computeActivity(profile, report.posts) : null

  return (
    <ProfileOverview
      profile={profile}
      connected={connected}
      refreshing={refreshing}
      refreshError={refreshError}
      lastGatheredIso={report.refreshedAt?.profile ?? profile?.gatheredAt}
      onRefresh={runRefresh}
      emptyHint={connected ? `Fetch @${activeTarget}'s profile, posts & network in one pull.` : 'Connect your X account first (header → Connect X).'}
      renderBio={(p: Profile) => <BioText text={p.bio ?? ''} bioUrls={p.bioUrls} />}
      activity={activity}
      synthesisSettings={synthesisSettings}
      onSynthesisChange={(patch) => updateReport(activeTarget, { synthesisSettings: { ...synthesisSettings, ...patch } })}
      footerAction={{ label: 'Remove from rail', onClick: handleRemove }}
    />
  )
}

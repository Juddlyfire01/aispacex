import { useMemo, useState } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { runGather, refreshNetwork } from '../../lib/x-intel/orchestrate'
import { SectionRefresh, SectionEmpty } from './section-actions'
import { canGatherTarget } from '../../lib/x-intel/fields'
import { type EdgeKind, type SiblingSubject } from '../../lib/x-intel/network-build'
import { buildNetworkFromPosts, type NetworkDirection } from '../../lib/x-intel/network-direction'
import { NetworkBubbleMap, kindTint } from './network-bubble-map'
import { NetworkRankedList } from './network-ranked-list'
import type { Edge, Post, Profile } from '../../lib/x-intel/types'
import { cn } from '../../lib/utils'

const KINDS: EdgeKind[] = ['mention', 'reply', 'quote', 'retweet']
const TOP_N_DEFAULT = 25
const TOP_N_MIN = 10
const TOP_N_MAX = 75

type ViewMode = 'list' | 'map'

/** id → { username } directory for attributing inbound authors, assembled from
 *  tracked siblings, post author handles, and mention entities (zero cost). */
function buildAuthorDirectory(
  siblings: SiblingSubject[] | undefined,
  posts: Post[] | undefined,
): Map<string, { username: string }> {
  const dir = new Map<string, { username: string }>()
  for (const s of siblings ?? []) {
    if (s.id && s.username) dir.set(s.id, { username: s.username })
  }
  for (const p of posts ?? []) {
    if (p.authorId && p.authorUsername && !dir.has(p.authorId)) {
      dir.set(p.authorId, { username: p.authorUsername })
    }
    for (const m of p.mentions) {
      if (m.id && m.username && !dir.has(m.id)) dir.set(m.id, { username: m.username })
    }
  }
  return dir
}

export interface NetworkGraphInnerProps {
  profile: Profile | null
  edges: Edge[]
  /** Subject's stored posts (outbound + inbound) for cross-link derivation. */
  posts?: Post[]
  /** Other tracked subjects (targets + self accounts) for cross-links/avatars. */
  siblings?: SiblingSubject[]
  /** Active subject label for empty-state copy (e.g. "@username"). */
  subjectLabel: string
  connected: boolean
  canGather: boolean
  refreshing: boolean
  refreshError: string | null
  onRefresh: () => void
  /** Called when a node is clicked; the inner graph handles the confirm/UX. */
  onAddTarget?: (username: string) => void
  /** Jump to a contributing post in Feed (list source expand). */
  onJumpToPost?: (postId: string) => void
  /** Whether to offer "Add as target" affordances. */
  canAddTargets: boolean
  lastGatheredIso?: string
}

/** Presentational network bubble map — props-driven so it can be wired to
 *  either a target or the connected self account. */
export function NetworkGraphInner({
  profile, edges, posts, siblings, subjectLabel, connected, canGather, refreshing,
  refreshError, onRefresh, onAddTarget, onJumpToPost, canAddTargets, lastGatheredIso,
}: NetworkGraphInnerProps) {
  const [kindFilter, setKindFilter] = useState<Set<EdgeKind>>(new Set(KINDS))
  const [topN, setTopN] = useState(TOP_N_DEFAULT)
  const [view, setView] = useState<ViewMode>('list')
  const [direction, setDirection] = useState<NetworkDirection>('outbound')

  // Posts-first model: direction is decided by who authored each post, not by
  // the blended Edge ledger (which is outbound-shaped and ate inbound).
  const model = useMemo(() => {
    if (!profile || !posts || posts.length === 0) return null
    return buildNetworkFromPosts(profile, posts, {
      direction,
      kinds: kindFilter,
      topN,
      authorDirectory: buildAuthorDirectory(siblings, posts),
      siblings,
    })
  }, [profile, posts, siblings, direction, kindFilter, topN])

  // No graph yet: nothing gathered, no profile, or gathered posts had no references.
  if (!profile || (!posts?.length && edges.length === 0)) {
    return (
      <SectionEmpty
        title="No network gathered yet"
        hint={canGather
          ? `Build ${subjectLabel}'s graph from their posts (inbound mentions are included).`
          : 'Connect your X account first (header → Connect X).'}
        actionLabel="Gather network"
        onAction={onRefresh}
        busy={refreshing}
        disabled={!canGather}
        error={refreshError}
      />
    )
  }

  const onNodeClick = (username: string) => {
    if (!canAddTargets || !onAddTarget) return
    if (username.toLowerCase() === profile.username.toLowerCase()) return
    if (!connected) {
      alert('Connect your X account (header → Connect X) to add profiles from the network graph.')
      return
    }
    if (confirm(`Add @${username} as a new profile to analyze?`)) {
      onAddTarget(username)
    }
  }

  const summaryParts: string[] = []
  const summaryTips: string[] = []
  if (model && model.longTailCount > 0) {
    summaryParts.push(`+${model.longTailCount} more accounts (${model.longTailWeight} interactions) below top ${topN}`)
    summaryTips.push(`Outside top ${topN} — raise the slider to show them.`)
  }
  if (model && model.unresolvedCount > 0) {
    summaryParts.push(`${model.unresolvedCount} unresolved`)
    summaryTips.push(`Reply/quote/RT targets with no known handle yet.`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--color-border-faint)] text-[10px]">
        <div className="flex items-center rounded-md border border-[var(--color-border-soft)] overflow-hidden">
          {(['inbound', 'outbound'] as NetworkDirection[]).map((dir) => (
            <button
              key={dir}
              onClick={() => setDirection(dir)}
              title={dir === 'outbound'
                ? `Who ${subjectLabel} engages (their mentions, replies, quotes, retweets)`
                : `Who engages ${subjectLabel} (mentions, replies, quotes, retweets of them)`}
              className={cn(
                'px-2 py-[3px] text-[10px] font-medium transition-colors',
                direction === dir
                  ? 'bg-[var(--color-accent)]/20 text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
              )}
            >
              {dir === 'outbound' ? 'Outbound' : 'Inbound'}
            </button>
          ))}
        </div>
        <span className="w-px h-3.5 bg-[var(--color-border-faint)]" />
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter((s) => {
              const next = new Set(s)
              if (next.has(k)) next.delete(k); else next.add(k)
              return next.size === 0 ? s : next
            })}
            className={cn(
              'px-2 py-[2px] rounded-full font-medium transition-all border',
              kindFilter.has(k) ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)] opacity-60',
            )}
            style={{ borderColor: kindTint(k) }}
          >
            {k}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-[var(--color-text-tertiary)] ml-2">
          top
          <input
            type="range" min={TOP_N_MIN} max={TOP_N_MAX} step={5} value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="w-24 accent-[var(--color-accent)]"
          />
          <span className="w-6 text-[var(--color-text-secondary)] tabular-nums">{topN}</span>
        </label>
        <div className="flex-1" />
        {summaryParts.length > 0 && (
          <span className="text-[var(--color-text-tertiary)] truncate max-w-[340px] mr-1" title={summaryTips.join(' ')}>
            {summaryParts.join(' · ')}
          </span>
        )}
        <div className="flex items-center rounded-md border border-[var(--color-border-soft)] overflow-hidden mr-1">
          {(['list', 'map'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={cn(
                'px-2 py-[3px] text-[10px] font-medium capitalize transition-colors',
                view === mode
                  ? 'bg-white/10 text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
              )}
            >
              {mode}
            </button>
          ))}
        </div>
        <SectionRefresh
          onClick={onRefresh}
          busy={refreshing}
          disabled={!canGather}
          lastGatheredIso={lastGatheredIso}
          error={refreshError}
        />
      </div>
      <div className="flex-1 min-h-0">
        {model && model.nodes.length === 0
          ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
              <p className="text-[12px] text-white/40">
                {direction === 'inbound'
                  ? `No inbound engagement gathered for ${subjectLabel} yet.`
                  : `No outbound engagement found in ${subjectLabel}'s gathered posts.`}
              </p>
              <p className="text-[11px] text-white/25">
                {direction === 'inbound'
                  ? 'Hit Refresh to pull who\u2019s mentioning them (included with the timeline).'
                  : 'Their recent posts may be all originals (no mentions/replies/quotes/retweets).'}
              </p>
            </div>
          )
          : model && (view === 'map'
            ? <NetworkBubbleMap model={model} onNodeClick={canAddTargets ? onNodeClick : undefined} />
            : <NetworkRankedList
                model={model}
                direction={direction}
                posts={posts}
                onJumpToPost={onJumpToPost}
                onNodeClick={canAddTargets ? onNodeClick : undefined}
              />)}
      </div>
    </div>
  )
}

/** Collect sibling subjects (other tracked targets + cached self accounts) so
 *  the builder can draw cross-links and reuse known avatars. */
export function collectSiblings(excludeProfileId: string | null): SiblingSubject[] {
  const { reports } = useXIntelStore.getState()
  const { accounts } = useXSelfStore.getState()
  const out: SiblingSubject[] = []
  const seen = new Set<string>()

  for (const report of Object.values(reports)) {
    const p = report.profile
    if (!p || p.id === excludeProfileId || seen.has(p.id)) continue
    seen.add(p.id)
    out.push({ id: p.id, username: p.username, avatarUrl: p.avatarUrl || null, edges: report.edges ?? [] })
  }
  for (const account of Object.values(accounts)) {
    const p = account.profile
    if (!p || p.id === excludeProfileId || seen.has(p.id)) continue
    seen.add(p.id)
    out.push({ id: p.id, username: p.username, avatarUrl: p.avatarUrl || null, edges: account.edges })
  }
  return out
}

/** Target-side wrapper: pulls the active target's data from useXIntelStore. */
export function NetworkGraph() {
  const activeTarget = useXIntelStore((s) => s.activeTarget)
  const report = useXIntelStore((s) => (s.activeTarget ? s.reports[s.activeTarget] : undefined))
  const addTarget = useXIntelStore((s) => s.addTarget)
  const jumpToFeedPost = useXIntelStore((s) => s.jumpToFeedPost)
  const connected = useXSelfStore((s) => s.connected)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const profileId = report?.profile?.id ?? null
  const siblings = useMemo(() => collectSiblings(profileId), [profileId])

  const runRefresh = async () => {
    if (!activeTarget) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      await refreshNetwork(activeTarget)
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const canGather = canGatherTarget(activeTarget, connected)

  if (!activeTarget || !report) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No profile selected</div>
  }

  const lastGathered = report.refreshedAt?.network ?? report.posts[0]?.gatheredAt

  const onAddTarget = (username: string) => {
    addTarget(username)
    runGather(username).catch(() => { /* surfaced in target rail */ })
  }

  return (
    <NetworkGraphInner
      profile={report.profile}
      edges={report.edges ?? []}
      posts={report.posts}
      siblings={siblings}
      subjectLabel={`@${activeTarget}`}
      connected={connected}
      canGather={canGather}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={runRefresh}
      onAddTarget={onAddTarget}
      onJumpToPost={jumpToFeedPost}
      canAddTargets
      lastGatheredIso={lastGathered}
    />
  )
}

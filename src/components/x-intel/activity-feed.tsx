import { useState } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { refreshPosts } from '../../lib/x-intel/orchestrate'
import { SectionRefresh, SectionEmpty } from './section-actions'
import type { Post } from '../../lib/x-intel/types'
import { cn, formatTokens } from '../../lib/utils'

type KindFilter = 'all' | Post['kind']
const FILTERS: KindFilter[] = ['all', 'original', 'reply', 'quote', 'retweet']

export interface ActivityFeedInnerProps {
  posts: Post[]
  watch: boolean
  onToggleWatch: (watch: boolean) => void
  refreshing: boolean
  refreshError: string | null
  onRefresh: () => void
  lastGatheredIso?: string
  connected: boolean
  /** Shown when no posts gathered yet. */
  emptyTitle?: string
  emptyHint: string
  emptyActionLabel?: string
}

/** Presentational activity feed — props-driven so it can be wired to either a
 *  target (via useXIntelStore) or the connected self account (via useXSelfStore). */
export function ActivityFeedInner({
  posts, watch, onToggleWatch, refreshing, refreshError, onRefresh,
  lastGatheredIso, connected, emptyTitle = 'No posts gathered yet', emptyHint,
  emptyActionLabel = 'Gather posts',
}: ActivityFeedInnerProps) {
  const [filter, setFilter] = useState<KindFilter>('all')

  if (posts.length === 0) {
    return (
      <SectionEmpty
        title={emptyTitle}
        hint={emptyHint}
        actionLabel={emptyActionLabel}
        onAction={onRefresh}
        busy={refreshing}
        disabled={!connected}
        error={refreshError}
      />
    )
  }

  const filtered = filter === 'all' ? posts : posts.filter((p) => p.kind === filter)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-[var(--color-border-faint)]">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'text-[10px] font-medium px-2 py-1 rounded-md transition-colors capitalize',
              filter === f
                ? 'text-[var(--color-text-primary)] bg-[var(--color-bg-raised)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[10px] text-white/25 cursor-pointer">
          <input
            type="checkbox"
            checked={watch}
            onChange={(e) => onToggleWatch(e.target.checked)}
            className="accent-white w-3 h-3"
          />
          Watch (refresh on open)
        </label>
        <SectionRefresh
          onClick={onRefresh}
          busy={refreshing}
          disabled={!connected}
          lastGatheredIso={lastGatheredIso}
          error={refreshError}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-white/10">No posts gathered yet — re-gather from the target rail</div>
        ) : (
          filtered.map((p) => (
            <div key={p.id} id={`post-${p.id}`} className="border border-[var(--color-border-faint)] rounded-lg p-3 bg-[var(--color-bg-raised)]">
              <div className="flex items-center gap-2 text-[10px] text-white/20 mb-1.5">
                <span className={cn(
                  'px-1.5 py-px rounded-full font-medium',
                  p.kind === 'original' && 'bg-white/[0.08] text-white/50',
                  p.kind === 'reply' && 'bg-blue-400/10 text-blue-300/50',
                  p.kind === 'quote' && 'bg-purple-400/10 text-purple-300/50',
                  p.kind === 'retweet' && 'bg-green-400/10 text-green-300/50',
                )}>{p.kind}</span>
                <span>{new Date(p.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-[12px] text-white/70 whitespace-pre-wrap break-words">{p.text}</p>
              <div className="flex gap-3 mt-2 text-[10px] text-white/20 font-mono">
                <span>{formatTokens(p.metrics.impressions)} views</span>
                <span>{formatTokens(p.metrics.likes)} likes</span>
                <span>{formatTokens(p.metrics.reposts)} reposts</span>
                <span>{formatTokens(p.metrics.replies)} replies</span>
                <span>{formatTokens(p.metrics.quotes)} quotes</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/** Target-side wrapper: pulls the active target's posts from useXIntelStore. */
export function ActivityFeed() {
  const activeTarget = useXIntelStore((s) => s.activeTarget)
  const report = useXIntelStore((s) => (s.activeTarget ? s.reports[s.activeTarget] : undefined))
  const updateReport = useXIntelStore((s) => s.updateReport)
  const connected = useXSelfStore((s) => s.connected)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const runRefresh = async () => {
    if (!activeTarget) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      await refreshPosts(activeTarget)
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  if (!activeTarget || !report) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No target selected</div>
  }

  // Per-section refresh timestamp (bumps even on a zero-new-posts pull), falling
  // back to the newest post's gatheredAt for reports persisted before this field.
  const lastGathered = report.refreshedAt?.feed ?? report.posts[0]?.gatheredAt

  return (
    <ActivityFeedInner
      posts={report.posts}
      watch={report.watch}
      onToggleWatch={(w) => updateReport(activeTarget, { watch: w })}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={runRefresh}
      lastGatheredIso={lastGathered}
      connected={connected}
      emptyHint={connected ? `Fetch @${activeTarget}'s recent posts (up to 50 per pull).` : 'Connect your X account first (header → Connect X).'}
    />
  )
}

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { refreshPosts } from '../../lib/x-intel/orchestrate'
import { SectionRefresh, SectionEmpty } from './section-actions'
import { canGatherTarget } from '../../lib/x-intel/fields'
import { matchesFeedFilters, postFeedFilterKeys, type FeedFilterKey } from '../../lib/x-intel/activity'
import { linkify } from '../../lib/x-intel/linkify'
import { postUrl } from '../../lib/x-intel/evidence'
import { EthAddressLink } from './eth-address-link'
import { MentionLink } from './mention-link'
import { Checkbox, CheckboxField } from '../ui/checkbox'
import type { Post, Profile } from '../../lib/x-intel/types'
import { cn, formatTokens } from '../../lib/utils'

/** Post body with @mentions, #hashtags, URLs and ETH/ENS identities linked. */
function PostText({ text }: { text: string }) {
  const linkCls = 'text-[var(--color-accent)] hover:underline'
  return (
    <p className="text-[12px] text-white/70 whitespace-pre-wrap break-words">
      {linkify(text).map((tok, i) => {
        switch (tok.type) {
          case 'url':
            return <a key={i} href={tok.href} target="_blank" rel="noopener noreferrer nofollow" className={linkCls}>{tok.value}</a>
          case 'mention':
            return <MentionLink key={i} username={tok.username} label={tok.value} />
          case 'hashtag':
            return <a key={i} href={`https://x.com/hashtag/${encodeURIComponent(tok.tag)}`} target="_blank" rel="noopener noreferrer nofollow" className={linkCls}>{tok.value}</a>
          case 'eth':
            return <EthAddressLink key={i} identity={tok.value} />
          default:
            return <span key={i}>{tok.value}</span>
        }
      })}
    </p>
  )
}

function useContentClamped(ref: React.RefObject<HTMLDivElement | null>, active: boolean, text: string) {
  const [clamped, setClamped] = useState(false)

  useLayoutEffect(() => {
    if (!active) {
      setClamped(false)
      return
    }
    const el = ref.current
    if (!el) return
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, active, text])

  return clamped
}

function ExpandablePostText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const collapsedRef = useRef<HTMLDivElement>(null)
  const isClamped = useContentClamped(collapsedRef, !expanded, text)
  const showToggle = expanded || isClamped

  return (
    <div>
      <div className="relative">
        {expanded ? (
          <PostText text={text} />
        ) : (
          <div ref={collapsedRef} className="line-clamp-6">
            <PostText text={text} />
          </div>
        )}
        {!expanded && isClamped && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-[var(--color-bg-raised)] via-[var(--color-bg-raised)]/90 to-transparent"
            aria-hidden
          />
        )}
      </div>
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[10px] font-medium text-[var(--color-accent)]/75 hover:text-[var(--color-accent)] transition-colors"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

const FILTER_OPTIONS: { key: FeedFilterKey; label: string; title?: string }[] = [
  { key: 'original', label: 'Original' },
  { key: 'reply', label: 'Reply' },
  { key: 'quote', label: 'Quote' },
  { key: 'retweet', label: 'RT' },
  { key: 'mention-in', label: 'Mentions in', title: 'Others @mentioning this profile' },
  { key: 'mention-out', label: 'Mentions out', title: 'This profile @mentioning someone' },
]

const ALL_FILTER_KEYS = FILTER_OPTIONS.map((o) => o.key)
const DEFAULT_FILTER_KEYS = ALL_FILTER_KEYS.filter((k) => k !== 'mention-in')

const KIND_PILL: Record<Post['kind'], string> = {
  original: 'bg-white/[0.08] text-white/50',
  reply: 'bg-blue-400/10 text-blue-300/50',
  quote: 'bg-purple-400/10 text-purple-300/50',
  retweet: 'bg-green-400/10 text-green-300/50',
}

function PostTypeBadges({
  profile,
  post,
  variant,
}: {
  profile: Profile | null
  post: Post
  /** Colored when mixed filters; muted when narrowed to one. */
  variant: 'muted' | 'colored'
}) {
  const keys = postFeedFilterKeys(profile, post)
  const inbound = keys.includes('mention-in')
  const mentionOut = keys.includes('mention-out')
  const muted = variant === 'muted'

  if (inbound) {
    return (
      <span className={cn(
        muted
          ? 'text-[10px] text-white/35'
          : 'px-1.5 py-px rounded-full font-medium bg-amber-400/10 text-amber-300/65',
      )}>
        mention in
      </span>
    )
  }
  return (
    <>
      <span className={cn(
        muted
          ? 'text-[10px] text-white/35 capitalize'
          : cn('px-1.5 py-px rounded-full font-medium', KIND_PILL[post.kind]),
      )}>
        {post.kind}
      </span>
      {mentionOut && (
        <span
          className={cn(
            muted
              ? 'text-[10px] text-white/25'
              : 'px-1.5 py-px rounded-full font-medium bg-cyan-400/10 text-cyan-300/60',
          )}
          title="This profile @mentioned someone"
        >
          {muted ? '· mentions out' : '@out'}
        </span>
      )}
    </>
  )
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

export interface ActivityFeedInnerProps {
  posts: Post[]
  /** Subject profile — used to separate authored posts from inbound mentions. */
  profile: Profile | null
  watch: boolean
  onToggleWatch: (watch: boolean) => void
  refreshing: boolean
  refreshError: string | null
  onRefresh: () => void
  lastGatheredIso?: string
  canRefresh: boolean
  /** Shown when no posts gathered yet. */
  emptyTitle?: string
  emptyHint: string
  emptyActionLabel?: string
  /** When set, scroll this post into view and briefly highlight it. */
  focusPostId?: string | null
  /** Bumps per jump so re-clicking the same post re-triggers scroll. */
  focusNonce?: number
  /** Called after scroll/highlight is attempted (or if the post isn't in the list). */
  onFocusHandled?: () => void
}

/** Presentational activity feed — props-driven so it can be wired to either a
 *  target (via useXIntelStore) or the connected self account (via useXSelfStore). */
export function ActivityFeedInner({
  posts, profile, watch, onToggleWatch, refreshing, refreshError, onRefresh,
  lastGatheredIso, canRefresh, emptyTitle = 'No posts gathered yet', emptyHint,
  emptyActionLabel = 'Gather posts', focusPostId, focusNonce = 0, onFocusHandled,
}: ActivityFeedInnerProps) {
  const [selected, setSelected] = useState<Set<FeedFilterKey>>(() => new Set(DEFAULT_FILTER_KEYS))
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const toggleFilter = (key: FeedFilterKey) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Deep-link from report citations: enable the post's filter if needed, then scroll.
  useEffect(() => {
    if (!focusPostId) return
    const post = posts.find((p) => p.id === focusPostId)
    if (!post) {
      onFocusHandled?.()
      return
    }
    const keys = postFeedFilterKeys(profile, post)
    if (!keys.some((k) => selected.has(k))) {
      setSelected((prev) => new Set([...prev, ...keys]))
      return
    }
    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`post-${focusPostId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightId(focusPostId)
        window.setTimeout(() => setHighlightId(null), 2500)
      }
      onFocusHandled?.()
    }, 80)
    return () => clearTimeout(scrollTimer)
  }, [focusPostId, focusNonce, posts, selected, profile, onFocusHandled])

  if (posts.length === 0) {
    return (
      <SectionEmpty
        title={emptyTitle}
        hint={emptyHint}
        actionLabel={emptyActionLabel}
        onAction={onRefresh}
        busy={refreshing}
        disabled={!canRefresh}
        error={refreshError}
      />
    )
  }

  const filtered = posts.filter((p) => matchesFeedFilters(profile, p, selected))
  const badgeVariant = selected.size > 1 ? 'colored' : 'muted' as const

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 border-b border-[var(--color-border-faint)]">
        {FILTER_OPTIONS.map(({ key, label, title }, i) => (
          <span key={key} className="flex items-center gap-3">
            {i === 4 && <span className="hidden sm:block w-px h-3 bg-white/[0.08]" aria-hidden />}
            <CheckboxField
              title={title}
              label={label}
              checked={selected.has(key)}
              onChange={() => toggleFilter(key)}
              className="text-[10px] text-white/40 hover:text-white/60"
            />
          </span>
        ))}
        <div className="flex-1 min-w-[8px]" />
        <CheckboxField
          label="Watch"
          checked={watch}
          onChange={onToggleWatch}
          tick="muted"
          className="text-[10px] text-white/25 shrink-0"
        />
        <SectionRefresh
          onClick={onRefresh}
          busy={refreshing}
          disabled={!canRefresh}
          lastGatheredIso={lastGatheredIso}
          error={refreshError}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-white/10">
            {selected.size === 0 ? 'No filters selected' : 'No posts match the selected filters'}
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              id={`post-${p.id}`}
              className={cn(
                'border border-[var(--color-border-faint)] rounded-lg p-3 bg-[var(--color-bg-raised)] transition-[box-shadow,border-color] duration-500',
                highlightId === p.id && 'border-[var(--color-accent)]/50 ring-2 ring-[var(--color-accent)]/20',
              )}
            >
              <div className="flex items-center gap-2 text-[10px] text-white/20 mb-1.5">
                <PostTypeBadges profile={profile} post={p} variant={badgeVariant} />
                <span>{new Date(p.createdAt).toLocaleString()}</span>
                <div className="flex-1" />
                <a
                  href={postUrl(p.id)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title="Open on X"
                  className="shrink-0 text-white/25 hover:text-[var(--color-accent)] transition-colors"
                >
                  <LinkIcon />
                </a>
              </div>
              <ExpandablePostText text={p.text} />
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

  const canGather = canGatherTarget(activeTarget, connected)

  if (!activeTarget || !report) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No profile selected</div>
  }

  // Per-section refresh timestamp (bumps even on a zero-new-posts pull), falling
  // back to the newest post's gatheredAt for reports persisted before this field.
  const lastGathered = report.refreshedAt?.feed ?? report.posts[0]?.gatheredAt
  const focusPostId = useXIntelStore((s) => s.feedFocusPostId)
  const focusNonce = useXIntelStore((s) => s.feedFocusNonce)
  const clearFeedFocus = useXIntelStore((s) => s.clearFeedFocus)

  return (
    <ActivityFeedInner
      posts={report.posts}
      profile={report.profile}
      watch={report.watch}
      onToggleWatch={(w) => updateReport(activeTarget, { watch: w })}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={runRefresh}
      lastGatheredIso={lastGathered}
      canRefresh={canGather}
      focusPostId={focusPostId}
      focusNonce={focusNonce}
      onFocusHandled={clearFeedFocus}
      emptyHint={canGather
        ? `Fetch @${activeTarget}'s recent posts (up to 50 per pull).`
        : 'Connect your X account first (header → Connect X).'}
    />
  )
}

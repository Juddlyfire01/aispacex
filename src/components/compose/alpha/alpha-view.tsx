import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAlphaStore } from '../../../stores/alpha-store'
import { useXIntelStore } from '../../../stores/x-intel-store'
import { useXSelfStore } from '../../../stores/x-self-store'
import { useModels } from '../../../hooks/use-models'
import { MarkdownMessage } from '../../chat/markdown-message'
import { LoadingState } from '../../ui/spinner'
import { StarButton } from '../../ui/star-button'
import { fmtCompact } from '../../../lib/venicestats/format'
import { ALPHA_COUNTS_TTL_MS, ALPHA_MAX_RAILS, ALPHA_NEWS_TTL_MS } from '../../../lib/alpha/default-rails'
import { rankGraphHeat } from '../../../lib/alpha/graph-heat'
import { formatVelocityPct } from '../../../lib/alpha/velocity'
import { rankRailsByHeat } from '../../../lib/alpha/rail-heat'
import {
  ALPHA_GROK_BRIEF_TTL_MS,
  fetchAlphaGrokBrief,
  pickAlphaGrokModel,
} from '../../../lib/alpha/grok-brief'
import {
  ALPHA_HYDRATE_MAX_IDS,
  fetchCountsRecent,
  fetchNewsScan,
  fetchPostsByIds,
  fetchSearchRecent,
} from '../../../lib/alpha/x-alpha-client'
import type {
  AlphaColdBrief,
  AlphaColdStory,
  AlphaPostCard,
  AlphaStory,
} from '../../../lib/alpha/types'
import {
  buildBriefHandoffMessages,
  buildRailHandoffMessages,
  buildStoryHandoffMessages,
  openComposeWithAlphaSeed,
} from '../../../lib/compose/open-alpha-compose'
import { openComposeForPost } from '../../../lib/compose/open-compose'
import { XAPIError } from '../../../lib/x-intel/x-client'
import { cn } from '../../../lib/utils'

function storyToCold(st: AlphaStory, cold?: AlphaColdStory): AlphaColdStory {
  return {
    id: st.id,
    name: st.name,
    hook: st.hook,
    summary: st.summary,
    category: st.category,
    clusterPostIds: st.clusterPostIds,
    url: st.url,
    fetchedAt: cold?.fetchedAt ?? Date.now(),
    pinned: cold?.pinned ?? false,
  }
}

function railVelocityLine(hourPct: number | null, dayPct: number | null): string | undefined {
  const bits: string[] = []
  if (hourPct != null) bits.push(`${formatVelocityPct(hourPct)} 1h`)
  if (dayPct != null) bits.push(`${formatVelocityPct(dayPct)} 24h`)
  return bits.length > 0 ? bits.join(' · ') : undefined
}

function Sparkline({ buckets }: { buckets: { tweet_count: number }[] }) {
  const vals = buckets.map((b) => b.tweet_count)
  if (vals.length < 2) {
    return <div className="h-8 w-full rounded bg-white/[0.03]" />
  }
  const max = Math.max(...vals, 1)
  const w = 160
  const h = 36
  const step = w / (vals.length - 1)
  const points = vals
    .map((v, i) => `${i * step},${h - (v / max) * (h - 2) - 1}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full text-sky-400/85" preserveAspectRatio="none">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  )
}

function postEngagementLine(p: AlphaPostCard): string {
  const bits: string[] = []
  if (p.authorUsername) bits.push(`@${p.authorUsername}`)
  if (p.likeCount != null) bits.push(`${fmtCompact(p.likeCount, 1)} likes`)
  if (p.retweetCount != null) bits.push(`${fmtCompact(p.retweetCount, 1)} RTs`)
  if (p.replyCount != null) bits.push(`${fmtCompact(p.replyCount, 1)} replies`)
  if (p.impressionCount != null) bits.push(`${fmtCompact(p.impressionCount, 1)} views`)
  return bits.join(' · ')
}

function latestBriefOfKind(
  briefs: Record<string, AlphaColdBrief>,
  kind: 'global' | 'rail',
  railId?: string,
): AlphaColdBrief | null {
  const list = Object.values(briefs).filter((b) => {
    if (b.kind !== kind) return false
    if (kind === 'rail' && railId != null) return b.railId === railId
    return true
  })
  if (list.length === 0) return null
  return list.reduce((a, b) => (b.fetchedAt > a.fetchedAt ? b : a))
}

function formatPostsExtraContext(posts: AlphaPostCard[] | undefined): string | undefined {
  if (!posts?.length) return undefined
  return posts
    .slice(0, 5)
    .map((p) => `@${p.authorUsername ?? '?'}: ${p.text.slice(0, 180)}`)
    .join('\n')
}

export function AlphaView() {
  const systemRails = useAlphaStore((s) => s.systemRails)
  const userRails = useAlphaStore((s) => s.userRails)
  const countsByRail = useAlphaStore((s) => s.countsByRail)
  const expandedRailId = useAlphaStore((s) => s.expandedRailId)
  const setExpandedRailId = useAlphaStore((s) => s.setExpandedRailId)
  const setCountsCache = useAlphaStore((s) => s.setCountsCache)
  const addCost = useAlphaStore((s) => s.addCost)
  const setRailEnabled = useAlphaStore((s) => s.setRailEnabled)
  const addUserRail = useAlphaStore((s) => s.addUserRail)
  const removeUserRail = useAlphaStore((s) => s.removeUserRail)
  const sessionCost = useAlphaStore((s) => s.sessionCost)
  const keepStory = useAlphaStore((s) => s.keepStory)
  const keepPosts = useAlphaStore((s) => s.keepPosts)
  const keepBrief = useAlphaStore((s) => s.keepBrief)
  const setColdPinned = useAlphaStore((s) => s.setColdPinned)
  const setNewsScan = useAlphaStore((s) => s.setNewsScan)
  const newsScan = useAlphaStore((s) => s.newsScan)
  const coldStories = useAlphaStore((s) => s.stories)
  const coldPosts = useAlphaStore((s) => s.posts)
  const coldBriefs = useAlphaStore((s) => s.briefs)

  const [storeHydrated, setStoreHydrated] = useState(() => useAlphaStore.persist.hasHydrated())
  useEffect(() => {
    const unsub = useAlphaStore.persist.onFinishHydration(() => setStoreHydrated(true))
    if (useAlphaStore.persist.hasHydrated()) setStoreHydrated(true)
    return unsub
  }, [])

  const xConnected = useXSelfStore((s) => s.connected)
  const selfAccounts = useXSelfStore((s) => s.accounts)
  const reports = useXIntelStore((s) => s.reports)

  const { data: models } = useModels('text')
  const grokModelId = useMemo(
    () => (models?.length ? pickAlphaGrokModel(models) : null),
    [models],
  )

  const [refreshing, setRefreshing] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [postsByRail, setPostsByRail] = useState<Record<string, AlphaPostCard[]>>({})
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null)
  const heroRailRef = useRef<HTMLElement | null>(null)

  const [newsLoading, setNewsLoading] = useState(false)
  const [clusterPostsByStory, setClusterPostsByStory] = useState<
    Record<string, AlphaPostCard[]>
  >({})
  const [hydratingStoryId, setHydratingStoryId] = useState<string | null>(null)
  /** Which news story shows its cluster (accordion — one at a time). */
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null)

  const [grokLoading, setGrokLoading] = useState(false)
  const [grokError, setGrokError] = useState<string | null>(null)
  const [railBriefLoadingId, setRailBriefLoadingId] = useState<string | null>(null)
  const [railBriefErrors, setRailBriefErrors] = useState<Record<string, string>>({})
  /** Which rail's brief is shown (single-open, like expand). Not persisted. */
  const [openBriefRailId, setOpenBriefRailId] = useState<string | null>(null)

  const [newLabel, setNewLabel] = useState('')
  const [newQuery, setNewQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showLocalGraph, setShowLocalGraph] = useState(false)

  const rails = useMemo(() => [...systemRails, ...userRails], [systemRails, userRails])
  const ranked = useMemo(
    () => rankRailsByHeat(rails, countsByRail),
    [rails, countsByRail],
  )

  /** Rail promoted to full-width hero: expanded posts OR an open brief. */
  const heroRailId = expandedRailId ?? openBriefRailId

  /** Hero rail floats to the top as a full-width card; rest packs 2-per-row. */
  const orderedRails = useMemo(() => {
    if (!heroRailId) return ranked
    const idx = ranked.findIndex((r) => r.rail.id === heroRailId)
    if (idx <= 0) return ranked
    const next = [...ranked]
    const [hero] = next.splice(idx, 1)
    next.unshift(hero)
    return next
  }, [ranked, heroRailId])

  const latestGlobalBrief = useMemo(
    () => latestBriefOfKind(coldBriefs, 'global'),
    [coldBriefs],
  )

  const latestRailBriefById = useMemo(() => {
    const map: Record<string, AlphaColdBrief> = {}
    for (const b of Object.values(coldBriefs)) {
      if (b.kind !== 'rail' || !b.railId) continue
      const prev = map[b.railId]
      if (!prev || b.fetchedAt > prev.fetchedAt) map[b.railId] = b
    }
    return map
  }, [coldBriefs])

  const graphHeat = useMemo(() => {
    const posts = [
      ...Object.values(selfAccounts).flatMap((a) =>
        (a.posts ?? []).map((p) => ({ ...p, _source: 'self' as const })),
      ),
      ...Object.values(reports).flatMap((r) =>
        (r.posts ?? []).map((p) => ({ ...p, _source: 'target' as const })),
      ),
    ]
    return rankGraphHeat(posts, 8)
  }, [selfAccounts, reports])

  const refreshCounts = useCallback(
    async (force = false) => {
      if (!xConnected) return
      const enabled = rails.filter((r) => r.enabled)
      if (enabled.length === 0) return
      setRefreshing(true)
      setLiveError(null)
      try {
        for (const rail of enabled) {
          const cached = countsByRail[rail.id]
          const fresh =
            cached &&
            cached.query === rail.query &&
            Date.now() - cached.fetchedAt < ALPHA_COUNTS_TTL_MS
          if (fresh && !force) continue
          try {
            const cache = await fetchCountsRecent(rail.id, rail.query)
            setCountsCache(cache)
            addCost(cache.cost)
          } catch (err) {
            if (err instanceof XAPIError && err.status === 401) {
              setLiveError(err.message)
              break
            }
            setLiveError(err instanceof Error ? err.message : String(err))
          }
        }
      } finally {
        setRefreshing(false)
      }
    },
    [xConnected, rails, countsByRail, setCountsCache, addCost],
  )

  const stories = newsScan?.stories ?? []
  const newsFetchedAt = newsScan?.fetchedAt ?? null
  const newsFresh =
    newsScan != null && Date.now() - newsScan.fetchedAt < ALPHA_NEWS_TTL_MS

  const refreshNews = useCallback(
    async (force = false) => {
      if (!xConnected) return
      if (!force && newsFresh) return
      setNewsLoading(true)
      setLiveError(null)
      try {
        const res = await fetchNewsScan()
        const fetchedAt = Date.now()
        setNewsScan({ stories: res.stories, fetchedAt, cost: res.cost })
        addCost(res.cost)
        for (const st of res.stories) {
          const prevPinned = useAlphaStore.getState().stories[st.id]?.pinned ?? false
          keepStory({
            id: st.id,
            name: st.name,
            hook: st.hook,
            summary: st.summary,
            category: st.category,
            clusterPostIds: st.clusterPostIds,
            url: st.url,
            fetchedAt,
            pinned: prevPinned,
          })
        }
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : String(err))
      } finally {
        setNewsLoading(false)
      }
    },
    [xConnected, newsFresh, addCost, keepStory, setNewsScan],
  )

  const runGrokBrief = useCallback(
    async (force = false) => {
      if (!models?.length || !grokModelId) {
        setGrokError('No Grok / X-search model in the catalog. Connect Venice and reload models.')
        return
      }
      const cached = latestBriefOfKind(useAlphaStore.getState().briefs, 'global')
      if (
        !force &&
        cached &&
        Date.now() - cached.fetchedAt < ALPHA_GROK_BRIEF_TTL_MS
      ) {
        return
      }
      setGrokLoading(true)
      setGrokError(null)
      try {
        const res = await fetchAlphaGrokBrief({
          model: grokModelId,
          models,
          rails,
          countsByRail,
        })
        if (!res.markdown.trim()) {
          setGrokError('Brief returned empty — nothing stored.')
          return
        }
        const prev = latestBriefOfKind(useAlphaStore.getState().briefs, 'global')
        const id = `brief-global-${res.fetchedAt}`
        keepBrief({
          id,
          kind: 'global',
          markdown: res.markdown,
          model: res.model,
          fetchedAt: res.fetchedAt,
          pinned: prev?.pinned ?? false,
        })
        if (prev?.pinned && prev.id !== id) {
          setColdPinned('brief', prev.id, false)
        }
        addCost(res.cost)
      } catch (err) {
        setGrokError(err instanceof Error ? err.message : String(err))
      } finally {
        setGrokLoading(false)
      }
    },
    [models, grokModelId, rails, countsByRail, addCost, keepBrief, setColdPinned],
  )

  const runRailBrief = useCallback(
    async (rail: (typeof rails)[number]) => {
      if (!models?.length || !grokModelId) {
        setRailBriefErrors((s) => ({
          ...s,
          [rail.id]:
            'No Grok / X-search model in the catalog. Connect Venice and reload models.',
        }))
        return
      }
      setRailBriefLoadingId(rail.id)
      setOpenBriefRailId(rail.id)
      setRailBriefErrors((s) => {
        const next = { ...s }
        delete next[rail.id]
        return next
      })
      try {
        const res = await fetchAlphaGrokBrief({
          model: grokModelId,
          models,
          rails: [rail],
          countsByRail,
          extraContext: formatPostsExtraContext(postsByRail[rail.id]),
        })
        if (!res.markdown.trim()) {
          setRailBriefErrors((s) => ({
            ...s,
            [rail.id]: 'Brief returned empty — nothing stored.',
          }))
          return
        }
        const prev = latestBriefOfKind(
          useAlphaStore.getState().briefs,
          'rail',
          rail.id,
        )
        const id = `brief-rail-${rail.id}-${res.fetchedAt}`
        keepBrief({
          id,
          kind: 'rail',
          railId: rail.id,
          railLabel: rail.label,
          query: rail.query,
          markdown: res.markdown,
          model: res.model,
          fetchedAt: res.fetchedAt,
          pinned: prev?.pinned ?? false,
        })
        if (prev?.pinned && prev.id !== id) {
          setColdPinned('brief', prev.id, false)
        }
        addCost(res.cost)
      } catch (err) {
        setRailBriefErrors((s) => ({
          ...s,
          [rail.id]: err instanceof Error ? err.message : String(err),
        }))
      } finally {
        setRailBriefLoadingId(null)
      }
    },
    [models, grokModelId, countsByRail, postsByRail, addCost, keepBrief, setColdPinned],
  )

  useEffect(() => {
    useAlphaStore.getState().pruneCold()
  }, [])

  useEffect(() => {
    if (!storeHydrated || !xConnected) return
    void refreshCounts(false)
    void refreshNews(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TTL via newsFresh; avoid counts loop
  }, [storeHydrated, xConnected, newsFresh])

  const loadCluster = useCallback(
    async (st: AlphaStory) => {
      if (!xConnected || st.clusterPostIds.length === 0) return
      setHydratingStoryId(st.id)
      setExpandedStoryId(st.id)
      setLiveError(null)
      try {
        const { posts, cost } = await fetchPostsByIds(
          st.clusterPostIds.slice(0, ALPHA_HYDRATE_MAX_IDS),
        )
        keepPosts(
          posts.map((p) => ({
            ...p,
            fetchedAt: Date.now(),
            pinned: false,
            storyId: st.id,
          })),
        )
        addCost(cost)
        setClusterPostsByStory((s) => ({ ...s, [st.id]: posts }))
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : String(err))
        setExpandedStoryId(null)
      } finally {
        setHydratingStoryId(null)
      }
    },
    [xConnected, keepPosts, addCost],
  )

  const toggleCluster = useCallback(
    (st: AlphaStory) => {
      if (expandedStoryId === st.id) {
        setExpandedStoryId(null)
        return
      }
      const cached =
        clusterPostsByStory[st.id] ??
        Object.values(useAlphaStore.getState().posts).filter((p) => p.storyId === st.id)
      if (cached.length > 0) {
        setClusterPostsByStory((s) => (s[st.id] ? s : { ...s, [st.id]: cached }))
        setExpandedStoryId(st.id)
        return
      }
      void loadCluster(st)
    },
    [expandedStoryId, clusterPostsByStory, loadCluster],
  )

  const loadExpand = useCallback(
    async (railId: string, query: string) => {
      if (!xConnected) return
      setLoadingExpand(railId)
      setLiveError(null)
      try {
        const search = await fetchSearchRecent(query, 15)
        setPostsByRail((s) => ({ ...s, [railId]: search.posts }))
        addCost(search.cost)
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoadingExpand(null)
      }
    },
    [xConnected, addCost],
  )

  const onToggleExpand = (railId: string, query: string) => {
    if (expandedRailId === railId) {
      setExpandedRailId(null)
      return
    }
    setExpandedRailId(railId)
    if (!postsByRail[railId]) {
      void loadExpand(railId, query)
    }
  }

  // When a rail becomes the hero (expanded posts or open brief), scroll it in.
  useEffect(() => {
    if (!heroRailId) return
    const el = heroRailRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [heroRailId])

  const onAddRail = () => {
    const id = addUserRail(newLabel || 'Custom', newQuery)
    if (id) {
      setNewLabel('')
      setNewQuery('')
      setShowAdd(false)
      void refreshCounts(true)
    }
  }

  const hottest = ranked[0]

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-4">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
              Alpha Radar
            </h1>
            <p className="mt-0.5 max-w-md text-[11px] text-[var(--color-text-tertiary)]">
              Live X volume · velocity · News clusters · native Grok X search.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sessionCost > 0 && (
              <span className="text-[10px] tabular-nums text-[var(--color-text-tertiary)]">
                ~${sessionCost.toFixed(3)} session
              </span>
            )}
            <button
              type="button"
              disabled={!xConnected || refreshing || newsLoading}
              onClick={() => {
                void refreshCounts(true)
                void refreshNews(true)
              }}
              className="rounded border border-white/[0.1] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] hover:bg-white/[0.04] disabled:opacity-40"
            >
              {refreshing || newsLoading ? 'Scanning…' : 'Refresh radar'}
            </button>
          </div>
        </header>

        {!xConnected && (
          <p className="rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2.5 text-[12px] text-amber-100/90">
            Connect X (header → Connect X) for live counts, X News, and post firehose. Grok brief
            still runs on Venice alone.
          </p>
        )}
        {liveError && (
          <p className="rounded-lg border border-red-400/25 bg-red-400/[0.07] px-3 py-2 text-[12px] text-red-100/90">
            {liveError}
          </p>
        )}

        {/* Grok X-search brief — highest signal */}
        <section className="space-y-2 rounded-xl border border-sky-400/20 bg-gradient-to-b from-sky-500/[0.07] to-transparent p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-sky-200/90">
                Grok X brief
              </h2>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">
                Venice{' '}
                <code className="text-[10px] text-sky-300/80">enable_x_search</code>
                {grokModelId ? ` · ${grokModelId}` : ' · no X-search model'}
              </p>
            </div>
            <button
              type="button"
              disabled={grokLoading || !grokModelId}
              onClick={() => void runGrokBrief(true)}
              className="rounded bg-sky-500/20 px-3 py-1.5 text-[11px] font-medium text-sky-100 hover:bg-sky-500/30 disabled:opacity-40"
            >
              {grokLoading
                ? 'Searching X…'
                : latestGlobalBrief
                  ? 'Re-run brief'
                  : 'Run live brief'}
            </button>
          </div>
          {grokError && (
            <p className="text-[11px] text-red-300/90">{grokError}</p>
          )}
          {grokLoading && !latestGlobalBrief && <LoadingState label="Grok scanning live X…" />}
          {latestGlobalBrief && (
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[13px] leading-relaxed">
              <div className="mb-1.5 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    openComposeWithAlphaSeed(buildBriefHandoffMessages(latestGlobalBrief))
                  }
                  className="rounded border border-sky-400/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-sky-200/90 hover:bg-sky-500/15"
                >
                  Open in Composer
                </button>
                <StarButton
                  starred={latestGlobalBrief.pinned}
                  onToggle={() =>
                    setColdPinned('brief', latestGlobalBrief.id, !latestGlobalBrief.pinned)
                  }
                  label="brief"
                  size={12}
                  title={
                    latestGlobalBrief.pinned
                      ? 'Remove bookmark (expires after 24h)'
                      : 'Bookmark (keep past 24h)'
                  }
                />
              </div>
              <MarkdownMessage content={latestGlobalBrief.markdown} size="compact" />
              <p className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">
                {new Date(latestGlobalBrief.fetchedAt).toLocaleTimeString()} ·{' '}
                {latestGlobalBrief.model} · native X search via Venice
              </p>
            </div>
          )}
          {!latestGlobalBrief && !grokLoading && (
            <p className="text-[12px] text-[var(--color-text-secondary)]">
              One shot: Grok searches live X against your rails and returns accelerating narratives,
              accounts, and post angles — not a static feed scrape.
            </p>
          )}
        </section>

        {/* X News — Grok-clustered stories from X API */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              Breaking on X News
            </h2>
            {newsFetchedAt && (
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                {newsLoading
                  ? 'Updating…'
                  : newsFresh
                    ? new Date(newsFetchedAt).toLocaleTimeString()
                    : `Cached · ${new Date(newsFetchedAt).toLocaleTimeString()}`}
              </span>
            )}
          </div>
          {(!storeHydrated || newsLoading) && stories.length === 0 && (
            <LoadingState label="Loading X News clusters…" />
          )}
          {storeHydrated && !xConnected && stories.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              X News needs a connected X account (proxied API).
            </p>
          )}
          {storeHydrated && !xConnected && stories.length > 0 && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              Showing last scan — connect X to refresh.
            </p>
          )}
          {storeHydrated && xConnected && !newsLoading && stories.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              No clustered stories in the current window — try Refresh radar.
            </p>
          )}
          <div className="grid items-start gap-2">
            {stories.slice(0, 8).map((st) => {
              const storyPinned = coldStories[st.id]?.pinned ?? false
              const hydrated =
                clusterPostsByStory[st.id] ??
                Object.values(coldPosts).filter((p) => p.storyId === st.id)
              const canHydrate = xConnected && st.clusterPostIds.length > 0
              const hydrating = hydratingStoryId === st.id
              const expanded = expandedStoryId === st.id
              const hasClusterCache = hydrated.length > 0

              return (
                <article
                  key={st.id}
                  className={cn(
                    'rounded-lg border bg-white/[0.025] px-3 py-2.5',
                    expanded ? 'border-sky-400/25' : 'border-white/[0.07]',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={st.url ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 transition hover:opacity-90"
                    >
                      <div className="text-[12px] font-medium leading-snug text-[var(--color-text-primary)]">
                        {st.name}
                      </div>
                      {(st.hook || st.summary) && (
                        <p className="mt-1 line-clamp-3 text-[11px] text-[var(--color-text-secondary)]">
                          {st.hook || st.summary}
                        </p>
                      )}
                    </a>
                    <StarButton
                      starred={storyPinned}
                      onToggle={() => setColdPinned('story', st.id, !storyPinned)}
                      label="story"
                      size={12}
                      title={
                        storyPinned
                          ? 'Remove bookmark (expires after 24h)'
                          : 'Bookmark (keep past 24h)'
                      }
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">
                      {st.category ? `${st.category} · ` : ''}
                      {st.clusterPostIds.length > 0
                        ? `${st.clusterPostIds.length} posts in cluster`
                        : 'X News'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          openComposeWithAlphaSeed(
                            buildStoryHandoffMessages(storyToCold(st, coldStories[st.id])),
                          )
                        }
                        className="rounded border border-sky-400/25 px-2 py-0.5 text-[10px] text-sky-200/90 hover:bg-sky-500/15"
                      >
                        Open in Composer
                      </button>
                      <button
                        type="button"
                        disabled={(!canHydrate && !hasClusterCache) || hydrating}
                        onClick={() => toggleCluster(st)}
                        className="rounded border border-white/[0.1] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)] hover:bg-white/[0.05] disabled:opacity-40"
                      >
                        {hydrating
                          ? 'Loading…'
                          : expanded
                            ? 'Close cluster'
                            : hasClusterCache
                              ? 'Show cluster'
                              : 'Load cluster'}
                      </button>
                    </div>
                  </div>
                  {expanded && (hydrating || hydrated.length > 0) && (
                    <div className="mt-2 space-y-1.5 border-t border-white/[0.05] pt-2">
                      {hydrating && hydrated.length === 0 && (
                        <LoadingState label="Hydrating cluster posts…" />
                      )}
                      {hydrated.map((p) => {
                        const postPinned = coldPosts[p.id]?.pinned ?? false
                        return (
                          <div
                            key={p.id}
                            className="rounded-md border border-white/[0.05] px-2.5 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noreferrer"
                                className="min-w-0 flex-1"
                              >
                                <p className="line-clamp-3 text-[11px] leading-snug text-[var(--color-text-secondary)]">
                                  {p.text}
                                </p>
                                <p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                                  {postEngagementLine(p)}
                                </p>
                              </a>
                              <StarButton
                                starred={postPinned}
                                onToggle={() => setColdPinned('post', p.id, !postPinned)}
                                label="post"
                                size={12}
                                title={
                                  postPinned
                                    ? 'Remove bookmark (expires after 24h)'
                                    : 'Bookmark (keep past 24h)'
                                }
                              />
                            </div>
                            <div className="mt-1 flex gap-2">
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-sky-300/80 hover:text-sky-200"
                              >
                                Open on X
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  openComposeForPost(p.id, { username: p.authorUsername })
                                }
                                className="text-[10px] text-sky-300/80 hover:text-sky-200"
                              >
                                Reply
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>

        {/* Radar rails */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                Volume rails
              </h2>
              {hottest && (hottest.hourPct != null || hottest.totalTweetCount > 0) && (
                <p className="text-[10px] text-[var(--color-text-tertiary)]">
                  Hottest: <span className="text-sky-300/90">{hottest.rail.label}</span>
                  {hottest.hourPct != null && (
                    <span className="ml-1 tabular-nums">
                      {formatVelocityPct(hottest.hourPct)} 1h
                    </span>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={rails.length >= ALPHA_MAX_RAILS}
              onClick={() => setShowAdd((v) => !v)}
              className="rounded border border-white/[0.08] px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-white/[0.04] disabled:opacity-40"
            >
              + Add rail
            </button>
          </div>

          {showAdd && (
            <div className="space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label"
                className="w-full rounded border border-white/[0.08] bg-transparent px-2 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-white/20"
              />
              <textarea
                value={newQuery}
                onChange={(e) => setNewQuery(e.target.value)}
                placeholder='X query e.g. ($VVV OR VeniceAI) -is:retweet lang:en'
                rows={2}
                className="w-full rounded border border-white/[0.08] bg-transparent px-2 py-1.5 font-mono text-[12px] text-[var(--color-text-primary)] outline-none focus:border-white/20"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onAddRail}
                  className="rounded bg-white/10 px-3 py-1 text-[11px] text-white hover:bg-white/15"
                >
                  Save rail
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="rounded px-3 py-1 text-[11px] text-[var(--color-text-tertiary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid items-start gap-2 sm:grid-cols-2">
            {orderedRails.map(({ rail, hourPct, dayPct, totalTweetCount, lastHourCount }) => {
              const cache = countsByRail[rail.id]
              const expanded = expandedRailId === rail.id
              const posts = postsByRail[rail.id] ?? []
              const disabledRail = rails.find((r) => r.id === rail.id)
              const railBrief = latestRailBriefById[rail.id]
              const railBriefLoading = railBriefLoadingId === rail.id
              const railBriefError = railBriefErrors[rail.id]
              const briefOpen = openBriefRailId === rail.id
              const isHero = rail.id === heroRailId
              const isHottest = rail.id === ranked[0]?.rail.id
              const recentRailBrief =
                railBrief != null && Date.now() - railBrief.fetchedAt < ALPHA_COUNTS_TTL_MS
              const shimmerBrief = isHottest && !recentRailBrief && !railBriefLoading

              return (
                <article
                  key={rail.id}
                  ref={isHero ? heroRailRef : undefined}
                  className={cn(
                    'scroll-mt-4 rounded-lg border bg-white/[0.02] transition-colors',
                    isHero
                      ? 'border-sky-400/40 ring-1 ring-sky-400/20 sm:col-span-2'
                      : 'border-white/[0.07]',
                  )}
                >
                  <div className="space-y-2 px-3 py-2.5">
                    {/* Title */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-[var(--color-text-primary)]">
                        {rail.label}
                      </h3>
                      <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                        <input
                          type="checkbox"
                          checked={disabledRail?.enabled ?? true}
                          onChange={(e) => setRailEnabled(rail.id, e.target.checked)}
                          className="accent-sky-400"
                        />
                        On
                      </label>
                    </div>

                    {/* Velocity + volume */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                        {rail.source}
                      </span>
                      {hourPct != null && (
                        <span
                          className={cn(
                            'text-[12px] font-semibold tabular-nums',
                            hourPct > 15
                              ? 'text-emerald-400'
                              : hourPct > 0
                                ? 'text-emerald-400/80'
                                : hourPct < 0
                                  ? 'text-rose-300/80'
                                  : 'text-[var(--color-text-tertiary)]',
                          )}
                          title="Hour-over-hour volume change"
                        >
                          {formatVelocityPct(hourPct)} 1h
                        </span>
                      )}
                      {dayPct != null && (
                        <span className="text-[11px] tabular-nums text-[var(--color-text-tertiary)]">
                          {formatVelocityPct(dayPct)} 24h
                        </span>
                      )}
                      {totalTweetCount > 0 && (
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">
                          {fmtCompact(totalTweetCount, 1)} / 7d
                          {lastHourCount > 0 ? ` · ${lastHourCount}/h` : ''}
                        </span>
                      )}
                    </div>

                    {/* Query */}
                    <p className="truncate font-mono text-[10px] text-[var(--color-text-tertiary)]">
                      {rail.query}
                    </p>

                    {/* Sparkline */}
                    {cache && cache.buckets.length > 0 && (
                      <div className="max-w-[240px]">
                        <Sparkline buckets={cache.buckets.slice(-48)} />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <button
                        type="button"
                        disabled={
                          railBriefLoading ||
                          ((!grokModelId || !xConnected) && !(railBrief && !briefOpen))
                        }
                        onClick={() => {
                          // Reopening a cached brief is free; only (re)brief refetches.
                          if (railBrief && !briefOpen && !railBriefLoading) {
                            setOpenBriefRailId(rail.id)
                            return
                          }
                          void runRailBrief(rail)
                        }}
                        className={cn(
                          'relative overflow-hidden rounded border border-sky-400/25 px-2 py-1 text-[10px] font-medium text-sky-200/90 hover:bg-sky-500/15 disabled:opacity-40',
                          shimmerBrief && 'border-sky-400/45 bg-sky-500/10',
                        )}
                      >
                        {shimmerBrief && (
                          <span
                            className="progress-track-shimmer pointer-events-none absolute inset-0 rounded"
                            aria-hidden
                          />
                        )}
                        <span className="relative">
                          {railBriefLoading
                            ? 'Briefing…'
                            : !railBrief
                              ? 'Brief this rail'
                              : briefOpen
                                ? 'Re-brief rail'
                                : 'Show brief'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openComposeWithAlphaSeed(
                            buildRailHandoffMessages(
                              rail,
                              railVelocityLine(hourPct, dayPct),
                            ),
                          )
                        }
                        className="rounded border border-white/[0.1] px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] hover:bg-white/[0.05]"
                      >
                        Open in Composer
                      </button>
                      <button
                        type="button"
                        disabled={!xConnected && !expanded}
                        onClick={() => onToggleExpand(rail.id, rail.query)}
                        className="rounded border border-white/[0.1] px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] hover:bg-white/[0.05] disabled:opacity-40"
                      >
                        {expanded
                          ? 'Collapse'
                          : loadingExpand === rail.id
                            ? 'Loading…'
                            : 'Live posts'}
                      </button>
                      {rail.source === 'user' && (
                        <button
                          type="button"
                          onClick={() => removeUserRail(rail.id)}
                          className="rounded px-2 py-1 text-[10px] text-red-300/70 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {briefOpen && (railBriefLoading || railBriefError || railBrief) && (
                    <div className="space-y-2 border-t border-white/[0.05] px-3 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                          Rail brief
                        </span>
                        <button
                          type="button"
                          onClick={() => setOpenBriefRailId(null)}
                          className="rounded border border-white/[0.1] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)] hover:bg-white/[0.05]"
                        >
                          Hide brief
                        </button>
                      </div>
                      {railBriefError && (
                        <p className="text-[11px] text-red-300/90">{railBriefError}</p>
                      )}
                      {railBriefLoading && !railBrief && (
                        <LoadingState label="Grok briefing this rail…" />
                      )}
                      {railBrief && (
                        <div className="rounded-md border border-white/[0.06] bg-black/15 px-2.5 py-2 text-[12px] leading-relaxed">
                          <div className="mb-1 flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                openComposeWithAlphaSeed(buildBriefHandoffMessages(railBrief))
                              }
                              className="rounded border border-sky-400/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-sky-200/90 hover:bg-sky-500/15"
                            >
                              Open in Composer
                            </button>
                            <StarButton
                              starred={railBrief.pinned}
                              onToggle={() =>
                                setColdPinned('brief', railBrief.id, !railBrief.pinned)
                              }
                              label="rail brief"
                              size={12}
                              title={
                                railBrief.pinned
                                  ? 'Remove bookmark (expires after 24h)'
                                  : 'Bookmark (keep past 24h)'
                              }
                            />
                          </div>
                          <MarkdownMessage content={railBrief.markdown} size="compact" />
                          <p className="mt-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                            {new Date(railBrief.fetchedAt).toLocaleTimeString()} ·{' '}
                            {railBrief.model}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {expanded && (
                    <div className="space-y-2 border-t border-white/[0.05] px-3 py-3">
                      {loadingExpand === rail.id && (
                        <LoadingState label="Pulling search/recent…" />
                      )}
                      {posts.map((p) => (
                        <a
                          key={p.id}
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-md border border-white/[0.05] px-2.5 py-2 hover:bg-white/[0.03]"
                        >
                          <p className="line-clamp-4 text-[12px] leading-snug text-[var(--color-text-secondary)]">
                            {p.text}
                          </p>
                          <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                            {postEngagementLine(p)}
                          </p>
                        </a>
                      ))}
                      {!loadingExpand && posts.length === 0 && xConnected && (
                        <p className="text-[11px] text-[var(--color-text-tertiary)]">
                          No posts for this query in the recent window.
                        </p>
                      )}
                    </div>
                  )}
                </article>
              )
            })}

            {/* Disabled rails still listed for re-enable */}
            {rails
              .filter((r) => !r.enabled)
              .map((rail) => (
                <article
                  key={rail.id}
                  className="flex items-center justify-between rounded-lg border border-white/[0.04] px-3 py-2 opacity-50"
                >
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">{rail.label}</span>
                  <button
                    type="button"
                    onClick={() => setRailEnabled(rail.id, true)}
                    className="text-[10px] text-sky-300/80 hover:text-sky-200"
                  >
                    Enable
                  </button>
                </article>
              ))}
          </div>
        </section>

        {/* Optional local graph — free, not the hero */}
        {graphHeat.length > 0 && (
          <section className="space-y-2 border-t border-white/[0.04] pt-4">
            <button
              type="button"
              onClick={() => setShowLocalGraph((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                Local Intel heat (no API)
              </h2>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                {showLocalGraph ? 'Hide' : 'Show'}
              </span>
            </button>
            {showLocalGraph && (
              <ul className="divide-y divide-white/[0.04] rounded-lg border border-white/[0.05]">
                {graphHeat.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block px-3 py-2 text-[12px] text-[var(--color-text-secondary)] hover:bg-white/[0.03]"
                    >
                      <span className="line-clamp-2">{item.text}</span>
                      <span className="mt-0.5 block text-[10px] text-[var(--color-text-tertiary)]">
                        {item.authorUsername ? `@${item.authorUsername}` : item.source}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

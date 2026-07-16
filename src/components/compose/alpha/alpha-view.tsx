import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAlphaStore } from '../../../stores/alpha-store'
import { useXIntelStore } from '../../../stores/x-intel-store'
import { useXSelfStore } from '../../../stores/x-self-store'
import { useModels } from '../../../hooks/use-models'
import { MarkdownMessage } from '../../chat/markdown-message'
import { LoadingState } from '../../ui/spinner'
import { fmtCompact } from '../../../lib/venicestats/format'
import { ALPHA_COUNTS_TTL_MS, ALPHA_MAX_RAILS } from '../../../lib/alpha/default-rails'
import { rankGraphHeat } from '../../../lib/alpha/graph-heat'
import { formatVelocityPct } from '../../../lib/alpha/velocity'
import { rankRailsByHeat } from '../../../lib/alpha/rail-heat'
import {
  ALPHA_GROK_BRIEF_TTL_MS,
  fetchAlphaGrokBrief,
  pickAlphaGrokModel,
} from '../../../lib/alpha/grok-brief'
import {
  fetchCountsRecent,
  fetchNewsScan,
  fetchSearchRecent,
} from '../../../lib/alpha/x-alpha-client'
import type { AlphaGrokBriefCache, AlphaPostCard, AlphaStory } from '../../../lib/alpha/types'
import { XAPIError } from '../../../lib/x-intel/x-client'
import { cn } from '../../../lib/utils'

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

  const [stories, setStories] = useState<AlphaStory[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsFetchedAt, setNewsFetchedAt] = useState<number | null>(null)

  const [grokBrief, setGrokBrief] = useState<AlphaGrokBriefCache | null>(null)
  const [grokLoading, setGrokLoading] = useState(false)
  const [grokError, setGrokError] = useState<string | null>(null)

  const [newLabel, setNewLabel] = useState('')
  const [newQuery, setNewQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showLocalGraph, setShowLocalGraph] = useState(false)

  const rails = useMemo(() => [...systemRails, ...userRails], [systemRails, userRails])
  const ranked = useMemo(
    () => rankRailsByHeat(rails, countsByRail),
    [rails, countsByRail],
  )

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

  const refreshNews = useCallback(async () => {
    if (!xConnected) return
    setNewsLoading(true)
    setLiveError(null)
    try {
      const res = await fetchNewsScan()
      setStories(res.stories)
      setNewsFetchedAt(Date.now())
      addCost(res.cost)
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : String(err))
    } finally {
      setNewsLoading(false)
    }
  }, [xConnected, addCost])

  const runGrokBrief = useCallback(
    async (force = false) => {
      if (!models?.length || !grokModelId) {
        setGrokError('No Grok / X-search model in the catalog. Connect Venice and reload models.')
        return
      }
      if (
        !force &&
        grokBrief &&
        Date.now() - grokBrief.fetchedAt < ALPHA_GROK_BRIEF_TTL_MS
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
        setGrokBrief({
          markdown: res.markdown,
          model: res.model,
          fetchedAt: res.fetchedAt,
        })
        addCost(res.cost)
      } catch (err) {
        setGrokError(err instanceof Error ? err.message : String(err))
      } finally {
        setGrokLoading(false)
      }
    },
    [models, grokModelId, grokBrief, rails, countsByRail, addCost],
  )

  useEffect(() => {
    if (!xConnected) return
    void refreshCounts(false)
    void refreshNews()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open + connection; TTL handles re-fetch
  }, [xConnected])

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
              Live X volume · velocity · News clusters · native Grok X search. Not a Signal buzz
              mirror.
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
              disabled={!xConnected || refreshing}
              onClick={() => {
                void refreshCounts(true)
                void refreshNews()
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
              {grokLoading ? 'Searching X…' : grokBrief ? 'Re-run brief' : 'Run live brief'}
            </button>
          </div>
          {grokError && (
            <p className="text-[11px] text-red-300/90">{grokError}</p>
          )}
          {grokLoading && !grokBrief && <LoadingState label="Grok scanning live X…" />}
          {grokBrief && (
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[13px] leading-relaxed">
              <MarkdownMessage content={grokBrief.markdown} size="compact" />
              <p className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">
                {new Date(grokBrief.fetchedAt).toLocaleTimeString()} · native X search via Venice
              </p>
            </div>
          )}
          {!grokBrief && !grokLoading && (
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
                {new Date(newsFetchedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          {newsLoading && stories.length === 0 && (
            <LoadingState label="Loading X News clusters…" />
          )}
          {!xConnected && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              X News needs a connected X account (proxied API).
            </p>
          )}
          {xConnected && !newsLoading && stories.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              No clustered stories in the current window — try Refresh radar.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {stories.slice(0, 8).map((st) => (
              <a
                key={st.id}
                href={st.url ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 transition hover:border-white/[0.12] hover:bg-white/[0.04]"
              >
                <div className="text-[12px] font-medium leading-snug text-[var(--color-text-primary)]">
                  {st.name}
                </div>
                {(st.hook || st.summary) && (
                  <p className="mt-1 line-clamp-3 text-[11px] text-[var(--color-text-secondary)]">
                    {st.hook || st.summary}
                  </p>
                )}
                <p className="mt-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                  {st.category ? `${st.category} · ` : ''}
                  {st.clusterPostIds.length > 0
                    ? `${st.clusterPostIds.length} posts in cluster`
                    : 'X News'}
                </p>
              </a>
            ))}
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

          <div className="space-y-2">
            {ranked.map(({ rail, hourPct, dayPct, totalTweetCount, lastHourCount }) => {
              const cache = countsByRail[rail.id]
              const expanded = expandedRailId === rail.id
              const posts = postsByRail[rail.id] ?? []
              const disabledRail = rails.find((r) => r.id === rail.id)

              return (
                <article
                  key={rail.id}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.02]"
                >
                  <div className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[13px] font-medium text-[var(--color-text-primary)]">
                          {rail.label}
                        </h3>
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
                      <p className="truncate font-mono text-[10px] text-[var(--color-text-tertiary)]">
                        {rail.query}
                      </p>
                      {cache && cache.buckets.length > 0 && (
                        <div className="max-w-[240px] pt-1">
                          <Sparkline buckets={cache.buckets.slice(-48)} />
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
                        <input
                          type="checkbox"
                          checked={disabledRail?.enabled ?? true}
                          onChange={(e) => setRailEnabled(rail.id, e.target.checked)}
                          className="accent-sky-400"
                        />
                        On
                      </label>
                      <button
                        type="button"
                        disabled={!xConnected}
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
                          className="text-[10px] text-red-300/70 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

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

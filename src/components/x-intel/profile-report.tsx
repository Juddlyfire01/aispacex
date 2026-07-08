import { useState } from 'react'
import { MarkdownMessage } from '../chat/markdown-message'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { generateReport, runGather } from '../../lib/x-intel/orchestrate'
import { computeAnalytics } from '../../lib/x-intel/analytics'
import { partitionPosts } from '../../lib/x-intel/activity'
import { splitEvidence, postUrl, profileUrl } from '../../lib/x-intel/evidence'
import type { IntelReportSnapshot, ReportAnalytics, ChangeSummary, Post, Profile } from '../../lib/x-intel/types'
import { formatTokens, cn } from '../../lib/utils'

/** Compact markdown renderer reusing the shared prose styling. Strips any
 * leaked "markdown:" label so older persisted reports render cleanly too. */
function Prose({ children }: { children: string }) {
  const clean = children?.replace(/^\s*(?:markdown|md)\s*:\s*/i, '') ?? ''
  if (!clean) return null
  return <MarkdownMessage content={clean} size="compact" className="text-[12.5px] text-white/70" />
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] font-medium text-white/25 uppercase tracking-[0.08em] mb-1.5">{children}</h3>
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function relDate(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Classic chain-link "external link" glyph. */
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

const EVIDENCE_VISIBLE = 10  // rows shown before the list becomes a scroll area

/**
 * Collapsible bar showing the count of cited posts; expands to a linked list
 * with a short excerpt pulled from the store when the post is held locally.
 * The first EVIDENCE_VISIBLE rows show at full height; beyond that the list
 * scrolls so long reports stay compact.
 */
function EvidencePosts({ ids, posts, onJumpToPost }: { ids: string[]; posts: Post[]; onJumpToPost: () => void }) {
  const [open, setOpen] = useState(false)
  if (ids.length === 0) return null
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] font-mono text-white/30 hover:text-white/55 transition-colors"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={cn('transition-transform', open && 'rotate-90')}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {ids.length} cited post{ids.length === 1 ? '' : 's'}
      </button>
      {open && (
        <div
          className={cn(
            'mt-1 space-y-1 pl-3 border-l border-white/[0.06]',
            ids.length > EVIDENCE_VISIBLE && 'max-h-[15rem] overflow-y-auto pr-1',
          )}
        >
          {ids.map((id) => {
            const post = posts.find((p) => p.id === id)
            return (
              <div key={id} className="flex items-start gap-1.5 text-[11px]">
                {post ? (
                  <button onClick={onJumpToPost} className="text-left flex-1 min-w-0 text-white/50 hover:text-white/75 transition-colors" title="View in Feed">
                    {post.text.slice(0, 120)}{post.text.length > 120 ? '…' : ''}
                    <span className="font-mono text-[9px] text-white/20"> · {formatTokens(post.metrics.likes)}L</span>
                  </button>
                ) : (
                  <span className="flex-1 min-w-0 font-mono text-[10px] text-white/35">post {id.slice(0, 12)}…</span>
                )}
                <a
                  href={postUrl(id)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title="Open on X"
                  className="shrink-0 mt-0.5 text-white/25 hover:text-[var(--color-accent)] transition-colors"
                >
                  <LinkIcon />
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** A small labeled stat cell. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-white/25">{label}</div>
      <div className="text-[13px] font-mono text-white/80 mt-0.5">{value}</div>
      {sub && <div className="text-[9px] text-white/25 font-mono">{sub}</div>}
    </div>
  )
}

/**
 * Interpret a ranked-list label. Network quote targets are unresolved post refs
 * ("post:<id>") — a quoted post whose author we haven't paid to resolve — so we
 * render them as a link to the post on X rather than a raw id. Everything else
 * (usernames, domains, topics) renders as plain text.
 */
function labelRef(label: string): { kind: 'post'; id: string } | { kind: 'text'; value: string } {
  const m = label.match(/^post:(\d{15,20})$/)
  if (m) return { kind: 'post', id: m[1] }
  return { kind: 'text', value: label }
}

/** The measuring bar + count shared by every ranked row. */
function RankBar({ count, max }: { count: number; max: number }) {
  const w = max > 0 ? Math.max(4, (count / max) * 100) : 0
  return (
    <>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div className="h-full rounded-full bg-white/25" style={{ width: `${w}%` }} />
      </div>
      <span className="text-[10px] font-mono text-white/30 w-6 text-right">{count}</span>
    </>
  )
}

/** Horizontal bar row for ranked counts (topics, domains, unresolved quote refs). */
function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const ref = labelRef(label)
  return (
    <div className="flex items-center gap-2 py-[3px]">
      {ref.kind === 'post' ? (
        <a
          href={postUrl(ref.id)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={`Quoted post ${ref.id} — open on X`}
          className="flex items-center gap-1 text-[11px] text-[var(--color-accent)]/75 hover:text-[var(--color-accent)] transition-colors w-28 shrink-0 min-w-0"
        >
          <LinkIcon className="shrink-0" />
          <span className="truncate font-mono text-[10px]">post {ref.id.slice(0, 8)}…</span>
        </a>
      ) : (
        <span className="text-[11px] text-white/55 truncate w-28 shrink-0">{ref.value}</span>
      )}
      <RankBar count={count} max={max} />
    </div>
  )
}

/**
 * Ranked row for an engaged account (mentions / replies). Renders "@username",
 * click adds it as a new intel target, and a link icon opens their X profile.
 */
function UsernameRow({ username, count, max, onAdd }: {
  username: string
  count: number
  max: number
  onAdd: (u: string) => void
}) {
  return (
    <div className="flex items-center gap-2 py-[3px] group/urow">
      <button
        onClick={() => onAdd(username)}
        title={`Add @${username} as a target`}
        className="text-[11px] text-white/55 hover:text-[var(--color-accent)] transition-colors truncate w-24 shrink-0 text-left"
      >
        @{username}
      </button>
      <a
        href={profileUrl(username)}
        target="_blank"
        rel="noopener noreferrer nofollow"
        title={`Open @${username} on X`}
        className="shrink-0 text-white/20 hover:text-[var(--color-accent)] transition-colors opacity-0 group-hover/urow:opacity-100 focus:opacity-100"
      >
        <LinkIcon />
      </a>
      <RankBar count={count} max={max} />
    </div>
  )
}

function RankedList({ items, empty }: { items: { label: string; count: number }[]; empty: string }) {
  if (items.length === 0) return <p className="text-[11px] text-white/15">{empty}</p>
  const max = Math.max(...items.map((i) => i.count))
  return <div>{items.map((i) => <BarRow key={i.label} label={i.label} count={i.count} max={max} />)}</div>
}

/** Ranked list of engaged accounts with add-as-target + profile link per row. */
function UsernameList({ items, empty, onAdd }: {
  items: { label: string; count: number }[]
  empty: string
  onAdd: (u: string) => void
}) {
  if (items.length === 0) return <p className="text-[11px] text-white/15">{empty}</p>
  const max = Math.max(...items.map((i) => i.count))
  return <div>{items.map((i) => <UsernameRow key={i.label} username={i.label} count={i.count} max={max} onAdd={onAdd} />)}</div>
}

/** 24-hour posting histogram as a tiny sparkline of bars. */
function HourHistogram({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours)
  return (
    <div className="flex items-end gap-[2px] h-12">
      {hours.map((c, h) => (
        <div key={h} className="flex-1 flex flex-col items-center justify-end group/bar" title={`${h}:00 UTC — ${c} posts`}>
          <div className="w-full rounded-sm bg-white/20 group-hover/bar:bg-white/40 transition-colors" style={{ height: `${(c / max) * 100}%`, minHeight: c > 0 ? 2 : 0 }} />
        </div>
      ))}
    </div>
  )
}

export function AnalyticsPanels({ a, posts, onAddTarget }: { a: ReportAnalytics; posts: Post[]; onAddTarget: (u: string) => void }) {
  const f = a.fundamentals
  const e = a.engagement
  const c = a.composition
  const postById = (id: string | null) => (id ? posts.find((p) => p.id === id) : undefined)
  const best = postById(e.bestPostId)

  return (
    <div className="space-y-4">
      {/* Fundamentals */}
      <section>
        <SectionTitle>Fundamentals</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Account age" value={`${f.accountAgeDays}d`} sub={`${f.lifetimeVelocity}/day lifetime`} />
          <Stat label="Follow ratio" value={`${f.followerFollowingRatio}:1`} sub={f.followRatioLabel} />
          <Stat label="Listed" value={formatTokens(f.listed)} />
          <Stat label="Analyzed" value={`${c.total} posts`} sub={a.cadence.spanDays > 0 ? `over ${a.cadence.spanDays}d` : undefined} />
        </div>
      </section>

      {/* Engagement */}
      <section>
        <SectionTitle>Engagement (analyzed set)</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Eng. rate" value={pct(e.engagementRate)} sub="likes / impr." />
          <Stat label="Bookmark rate" value={pct(e.bookmarkRate)} sub="saves / impr." />
          <Stat label="Amplification" value={pct(e.amplificationRate)} sub="reposts / impr." />
          <Stat label="Avg likes" value={formatTokens(e.likes.avg)} sub={`max ${formatTokens(e.likes.max)}`} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-white/30">
          <span>impr avg {formatTokens(e.impressions.avg)}</span>
          <span>replies avg {formatTokens(e.replies.avg)}</span>
          <span>quotes avg {formatTokens(e.quotes.avg)}</span>
          <span>top-decile {formatTokens(e.topDecileLikes)}L</span>
        </div>
        {best && (
          <div className="mt-2 text-[10px] text-white/30">
            Best performer: <span className="text-white/50">{best.text.slice(0, 80)}</span> ({formatTokens(best.metrics.likes)}L)
          </div>
        )}
      </section>

      {/* Composition */}
      <section>
        <SectionTitle>Composition</SectionTitle>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/50 font-mono">
          <span>{c.byKindPct.original}% original</span>
          <span>{c.byKindPct.reply}% reply</span>
          <span>{c.byKindPct.quote}% quote</span>
          <span>{c.byKindPct.retweet}% retweet</span>
          <span className="text-white/30">· {c.withMediaPct}% media</span>
          <span className="text-white/30">{c.withLinkPct}% links</span>
        </div>
      </section>

      {/* Cadence */}
      <section>
        <SectionTitle>Cadence — {a.cadence.pattern}, {a.cadence.variance} variance</SectionTitle>
        <HourHistogram hours={a.cadence.hourHistogramUtc} />
        <div className="flex justify-between text-[9px] font-mono text-white/20 mt-1">
          <span>00 UTC</span>
          <span>{a.cadence.avgPerDay}/day{a.cadence.peakHoursUtc.length > 0 ? ` · peaks ${a.cadence.peakHoursUtc.map((h) => `${h}:00`).join(', ')}` : ''}</span>
          <span>23 UTC</span>
        </div>
      </section>

      {/* Topics + info diet */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section>
          <SectionTitle>Top topics (X-annotated)</SectionTitle>
          <RankedList items={a.topics.entities.slice(0, 6)} empty="No topic annotations" />
        </section>
        <section>
          <SectionTitle>Information diet</SectionTitle>
          <RankedList items={a.infoDiet.domains.slice(0, 6)} empty="No linked domains" />
        </section>
      </div>

      {/* Network */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section>
          <SectionTitle>Most mentioned</SectionTitle>
          <UsernameList items={a.network.topMentioned.slice(0, 6)} empty="No mentions" onAdd={onAddTarget} />
        </section>
        <section>
          <SectionTitle>Most replied to</SectionTitle>
          <UsernameList items={a.network.topReplied.slice(0, 6)} empty="No reply activity" onAdd={onAddTarget} />
        </section>
      </div>
    </div>
  )
}

export function ChangeSummaryPanel({ change }: { change: ChangeSummary }) {
  const shifts = change.metricShifts.filter((m) => Math.abs(m.deltaPct) >= 1)
  const ownAdded = change.volumeAddedOwn ?? change.volumeAdded
  const inboundAdded = change.volumeAddedInbound ?? 0
  const volumeLabel = inboundAdded > 0 && ownAdded !== change.volumeAdded
    ? `+${ownAdded} authored · +${inboundAdded} mentions gathered`
    : inboundAdded > 0 && ownAdded === 0
      ? `+${inboundAdded} mentions gathered`
      : `+${change.volumeAdded} authored`
  return (
    <section className="rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/[0.04] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <SectionTitle>What changed since last report</SectionTitle>
        <span className="text-[10px] font-mono text-[var(--color-accent)]/80">{volumeLabel}</span>
      </div>
      {change.narrative && <Prose>{change.narrative}</Prose>}
      {shifts.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono">
          {shifts.map((m) => (
            <span key={m.metric} className={cn(m.deltaPct > 0 ? 'text-green-400/60' : 'text-red-400/60')}>
              {m.metric} {m.deltaPct > 0 ? '+' : ''}{m.deltaPct}%
            </span>
          ))}
        </div>
      )}
      {(change.emergingTopics.length > 0 || change.fadingTopics.length > 0) && (
        <div className="text-[10px] space-y-0.5">
          {change.emergingTopics.length > 0 && (
            <div className="text-white/40">Emerging: <span className="text-green-400/60">{change.emergingTopics.slice(0, 6).join(', ')}</span></div>
          )}
          {change.fadingTopics.length > 0 && (
            <div className="text-white/40">Fading: <span className="text-white/30">{change.fadingTopics.slice(0, 6).join(', ')}</span></div>
          )}
        </div>
      )}
      {(change.compositionDrift.length > 0 || change.cadenceDrift.length > 0) && (
        <div className="text-[10px] text-white/30 font-mono">
          {[...change.compositionDrift, ...change.cadenceDrift].join(' · ')}
        </div>
      )}
    </section>
  )
}

export function NarrativePanels({ snapshot, posts, onJumpToPost }: {
  snapshot: IntelReportSnapshot
  posts: Post[]
  onJumpToPost: () => void
}) {
  const n = snapshot.narrative
  return (
    <div className="space-y-4">
      {n.executiveSummary && (
        <section>
          <SectionTitle>Executive summary</SectionTitle>
          <Prose>{n.executiveSummary}</Prose>
        </section>
      )}
      {n.strategicAssessment && (
        <section>
          <SectionTitle>Strategic assessment</SectionTitle>
          <Prose>{n.strategicAssessment}</Prose>
        </section>
      )}
      {n.themes.length > 0 && (
        <section>
          <SectionTitle>Themes</SectionTitle>
          <div className="space-y-2">
            {n.themes.map((t, i) => {
              const { prose, ids } = splitEvidence(t.evidence ?? '')
              return (
                <div key={i} className="text-[11.5px]">
                  <span className="text-white/70 font-medium">{t.name}</span>
                  {prose && <span className="text-white/35"> — {prose}</span>}
                  <EvidencePosts ids={ids} posts={posts} onJumpToPost={onJumpToPost} />
                </div>
              )
            })}
          </div>
        </section>
      )}
      {n.register.description && (
        <section>
          <SectionTitle>Register</SectionTitle>
          <p className="text-[12px] text-white/60">{n.register.description}</p>
          {n.register.devices.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {n.register.devices.map((d) => (
                <span key={d} className="text-[10px] px-2 py-[2px] rounded-full bg-white/[0.05] text-white/45">{d}</span>
              ))}
            </div>
          )}
        </section>
      )}
      {n.narrativeArcs.length > 0 && (
        <section>
          <SectionTitle>Narrative arcs</SectionTitle>
          <div className="space-y-2">
            {n.narrativeArcs.map((arc, i) => {
              const { prose, ids } = splitEvidence(arc.evidence ?? '')
              return (
                <div key={i} className="text-[11.5px] text-white/55">
                  <span className="text-white/70">{arc.arc}</span> <span className="font-mono text-[10px] text-white/30">({arc.trend})</span>
                  {prose && <span className="text-white/30"> — {prose}</span>}
                  <EvidencePosts ids={ids} posts={posts} onJumpToPost={onJumpToPost} />
                </div>
              )
            })}
          </div>
        </section>
      )}
      {n.audienceRead && (
        <section>
          <SectionTitle>Audience</SectionTitle>
          <p className="text-[12px] text-white/60">{n.audienceRead}</p>
        </section>
      )}
      {n.notablePosts.length > 0 && (
        <section>
          <SectionTitle>Notable posts</SectionTitle>
          <div className="space-y-1.5">
            {n.notablePosts.map((np) => {
              const post = posts.find((p) => p.id === np.postId)
              return (
                <button
                  key={np.postId}
                  onClick={onJumpToPost}
                  className="text-left w-full border border-[var(--color-border-faint)] rounded-lg p-2.5 bg-[var(--color-bg-raised)] hover:border-[var(--color-border-strong)] transition-colors"
                >
                  {post ? (
                    <p className="text-[12px] text-white/65">{post.text.slice(0, 140)}{post.text.length > 140 ? '…' : ''}</p>
                  ) : (
                    <p className="text-[11px] text-white/25 font-mono">post {np.postId}</p>
                  )}
                  <p className="text-[10px] text-white/30 mt-1">{np.why}
                    {post && <span className="font-mono text-white/20"> · {formatTokens(post.metrics.likes)}L · view in Feed →</span>}
                  </p>
                </button>
              )
            })}
          </div>
        </section>
      )}
      {n.contradictions.length > 0 && (
        <section>
          <SectionTitle>Contradictions / tensions</SectionTitle>
          <ul className="list-disc pl-4 space-y-0.5">
            {n.contradictions.map((c, i) => <li key={i} className="text-[11.5px] text-white/50">{c}</li>)}
          </ul>
        </section>
      )}
      {n.engagementHooks.length > 0 && (
        <section>
          <SectionTitle>Engagement hooks</SectionTitle>
          <ul className="list-disc pl-4 space-y-0.5">
            {n.engagementHooks.map((h, i) => <li key={i} className="text-[11.5px] text-white/55">{h}</li>)}
          </ul>
        </section>
      )}
      {n.analystConclusions.length > 0 && (
        <section>
          <SectionTitle>Analyst conclusions</SectionTitle>
          <ul className="list-disc pl-4 space-y-0.5">
            {n.analystConclusions.map((c, i) => <li key={i} className="text-[11.5px] text-white/60">{c}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

export function ReportTimeline({ history, activeId, onSelect, onDelete }: {
  history: IntelReportSnapshot[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (history.length === 0) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {history.map((r, i) => {
        const active = r.id === activeId
        const delta = r.changeSummary
        const deltaLabel = delta
          ? (delta.volumeAddedInbound ?? 0) > 0 && (delta.volumeAddedOwn ?? delta.volumeAdded) === 0
            ? `+${delta.volumeAddedInbound} mentions`
            : (delta.volumeAddedInbound ?? 0) > 0
              ? `+${delta.volumeAddedOwn ?? 0}/${delta.volumeAdded}`
              : `+${delta.volumeAdded}`
          : null
        return (
          <div
            key={r.id}
            className={cn(
              'group/report relative shrink-0 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors',
              active ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/[0.06]' : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.15]',
            )}
            onClick={() => onSelect(r.id)}
          >
            <div className="text-[10px] font-medium text-white/70 whitespace-nowrap">{relDate(r.createdAt)}</div>
            <div className="text-[9px] font-mono text-white/30 whitespace-nowrap">
              {r.meta.postCount} posts
              {i === history.length - 1 ? ' · baseline' : deltaLabel != null ? ` · ${deltaLabel}` : ''}
            </div>
            <button
              onClick={(ev) => { ev.stopPropagation(); onDelete(r.id) }}
              title="Delete report"
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-bg-raised)] border border-white/10 text-white/30 hover:text-red-400/80 text-[10px] leading-none opacity-0 group-hover/report:opacity-100 transition-opacity"
            >×</button>
          </div>
        )
      })}
    </div>
  )
}

function storedPostsLabel(profile: Profile | null | undefined, posts: Post[]): string {
  if (!posts.length) return 'no posts yet'
  if (!profile) return `${posts.length} posts stored`
  const { own, inbound } = partitionPosts(profile, posts)
  if (inbound.length === 0) return `${posts.length} posts stored`
  return `${posts.length} stored (${own.length} authored · ${inbound.length} mentions)`
}

export function ProfileReport() {
  const activeTarget = useXIntelStore((s) => s.activeTarget)
  const report = useXIntelStore((s) => (s.activeTarget ? s.reports[s.activeTarget] : undefined))
  const setActiveReport = useXIntelStore((s) => s.setActiveReport)
  const deleteReport = useXIntelStore((s) => s.deleteReport)
  const setActiveSubTab = useXIntelStore((s) => s.setActiveSubTab)
  const addTarget = useXIntelStore((s) => s.addTarget)
  const connected = useXSelfStore((s) => s.connected)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Add an engaged account (from mentions/replies) as a new intel target.
  const addAsTarget = (username: string) => {
    if (!connected) {
      alert('Connect your X account (header → Connect X) to add targets from the network.')
      return
    }
    if (confirm(`Add @${username} as a new intel target?`)) {
      addTarget(username)
      runGather(username).catch(() => { /* surfaced in target rail */ })
    }
  }

  if (!activeTarget || !report) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No target selected</div>
  }

  const { profile, posts, edges, reportHistory, activeReportId } = report
  const hasPosts = posts.length > 0
  const active = reportHistory.find((r) => r.id === activeReportId) ?? reportHistory[0] ?? null

  // Live analytics preview over current posts (free, instant) when no report is selected yet.
  const liveAnalytics = !active && profile && hasPosts ? computeAnalytics(profile, posts, edges) : null

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await generateReport(activeTarget)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report generation failed')
    } finally {
      setBusy(false)
    }
  }

  const buttonLabel = busy ? 'Generating…' : reportHistory.length > 0 ? 'Generate new report' : 'Generate report'

  return (
    <div className="h-full overflow-y-auto px-6 py-4 space-y-4">
      {/* Header: title + generate */}
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-white/80">Intelligence report</h2>
        <span className="text-[10px] text-white/25 font-mono">
          {storedPostsLabel(profile, posts)}
        </span>
        <div className="flex-1" />
        <button
          onClick={run}
          disabled={busy || !hasPosts || !profile}
          title={!hasPosts ? 'Gather posts first' : `Analyzes ${posts.length} stored posts (Venice tokens)`}
          className="px-3 py-1 text-[11px] font-medium bg-white text-black rounded-md hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {buttonLabel}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-400/70">{error}</p>}

      {/* Timeline */}
      <ReportTimeline
        history={reportHistory}
        activeId={active?.id ?? null}
        onSelect={(id) => setActiveReport(activeTarget, id)}
        onDelete={(id) => deleteReport(activeTarget, id)}
      />

      {/* Body */}
      {active ? (
        <div className="space-y-5">
          {active.changeSummary && <ChangeSummaryPanel change={active.changeSummary} />}
          <AnalyticsPanels a={active.analytics} posts={posts} onAddTarget={addAsTarget} />
          <div className="border-t border-white/[0.05] pt-4">
            <NarrativePanels snapshot={active} posts={posts} onJumpToPost={() => setActiveSubTab('feed')} />
          </div>
          <p className="text-[10px] text-white/12 font-mono pt-2">
            Report {relDate(active.createdAt)} · {active.model} · {active.meta.postCount} posts
            {active.meta.dateRange && ` · ${new Date(active.meta.dateRange.from).toLocaleDateString()}–${new Date(active.meta.dateRange.to).toLocaleDateString()}`}
            {active.meta.tokenCost > 0 && ` · ${formatTokens(active.meta.tokenCost)} tokens`}
          </p>
        </div>
      ) : liveAnalytics ? (
        <div className="space-y-5">
          <p className="text-[11px] text-white/30">
            Live analytics preview (computed, free). Generate a report to add analyst narrative and start tracking changes over time.
          </p>
          <AnalyticsPanels a={liveAnalytics} posts={posts} onAddTarget={addAsTarget} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
          <p className="text-[12px] text-white/40 font-medium">No report yet</p>
          <p className="text-[11px] text-white/25 max-w-xs">
            {hasPosts
              ? 'Generate a comprehensive intelligence report from the gathered posts.'
              : connected ? 'Gather posts from the target rail first, then generate a report.' : 'Connect your X account, gather posts, then generate a report.'}
          </p>
        </div>
      )}
    </div>
  )
}
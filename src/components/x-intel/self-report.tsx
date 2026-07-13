import { useEffect, useState } from 'react'
import { useXSelfStore } from '../../stores/x-self-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { generateSelfReport } from '../../lib/x-intel/self-orchestrate'
import { computeAnalytics } from '../../lib/x-intel/analytics'
import { AnalyticsPanels, ChangeSummaryPanel, NarrativePanels, ReportTimeline } from './profile-report'
import { postUrl } from '../../lib/x-intel/evidence'
import { formatTokens } from '../../lib/utils'
import { ReportExportButton } from './report-export-button'
import { LoadingState } from '../ui/spinner'
import { usePreserveScroll } from '../../hooks/use-preserve-scroll'
import { canGenerateAfterRefresh, GENERATE_NEEDS_REFRESH_HINT } from '../../lib/x-intel/report-gate'
import type { Post } from '../../lib/x-intel/types'

function relDate(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** A compact list of saved/liked posts — the OAuth-only extras a target lacks. */
function ExtrasList({ title, posts, empty }: { title: string; posts: Post[]; empty: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] font-medium text-white/25 hover:text-white/50 uppercase tracking-[0.08em] transition-colors"
      >
        {title} ({posts.length})
      </button>
      {open && (
        posts.length === 0 ? (
          <p className="text-[11px] text-white/15 mt-1.5">{empty}</p>
        ) : (
          <div className="mt-1.5 space-y-1 max-h-[18rem] overflow-y-auto pr-1">
            {posts.slice(0, 100).map((p) => (
              <a
                key={p.id}
                href={postUrl(p.id)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="block text-[11px] text-white/50 hover:text-white/80 border border-white/[0.05] rounded-md px-2 py-1.5 transition-colors"
              >
                {p.text.slice(0, 140)}{p.text.length > 140 ? '…' : ''}
                <span className="font-mono text-[9px] text-white/20"> · {formatTokens(p.metrics.likes)}L</span>
              </a>
            ))}
          </div>
        )
      )}
    </section>
  )
}

export function SelfReport({ syncing = false }: { syncing?: boolean }) {
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const account = useXSelfStore((s) => (s.activeAccountId ? s.accounts[s.activeAccountId] : undefined))
  const setActiveReport = useXSelfStore((s) => s.setActiveReport)
  const deleteReport = useXSelfStore((s) => s.deleteReport)
  const jumpToSelfFeedPost = useXIntelStore((s) => s.jumpToSelfFeedPost)

  const profile = account?.profile ?? null
  const posts = account?.posts ?? []
  const edges = account?.edges ?? []
  const bookmarks = account?.bookmarks ?? []
  const likes = account?.likes ?? []
  const reportHistory = account?.reportHistory ?? []
  const activeReportId = account?.activeReportId ?? null

  // The persist middleware hydrates from localStorage asynchronously. On a
  // fresh page load (incl. the OAuth redirect return) `reportHistory` starts
  // empty and re-hydrates a frame or two later — without this guard we'd flash
  // "No report yet" even when the user has saved reports on disk.
  const [hydrated, setHydrated] = useState(useXSelfStore.persist.hasHydrated())
  useEffect(() => {
    if (hydrated) return
    const unsub = useXSelfStore.persist.onFinishHydration(() => setHydrated(true))
    if (useXSelfStore.persist.hasHydrated()) setHydrated(true)
    return unsub
  }, [hydrated])

  // Busy/error live in the store so leaving Profile mid-generation does not
  // drop "Generating…" or allow a second concurrent job for the same account.
  const busy = useXSelfStore((s) =>
    s.activeAccountId ? Boolean(s.generatingReports[s.activeAccountId]) : false,
  )
  const error = useXSelfStore((s) =>
    s.activeAccountId ? (s.reportGenerateErrors[s.activeAccountId] ?? null) : null,
  )

  const hasPosts = posts.length > 0
  const active = reportHistory.find((r) => r.id === activeReportId) ?? reportHistory[0] ?? null
  const liveAnalytics = !active && profile && hasPosts ? computeAnalytics(profile, posts, edges) : null

  const latestReportAt = reportHistory[0]?.createdAt
  const needsRefresh = !canGenerateAfterRefresh(latestReportAt, account?.refreshedAt?.profile)
  const canGenerate = Boolean(profile && hasPosts && !needsRefresh)

  const run = () => {
    if (busy || !canGenerate) return
    // Blur so focus restoration does not yank the pane when the button re-enables.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    void generateSelfReport().catch(() => { /* error stored on x-self-store */ })
  }

  // Self view has no "add target" affordance; mentions/replies just no-op.
  const noAdd = () => { /* self report: engaged accounts are not target-addable */ }

  // Anchor on active report so a finished generate (or timeline pick) lands at top;
  // mid-read refreshes still preserve scroll via the same hook.
  const { ref: scrollRef, onScroll } = usePreserveScroll(activeAccountId, active?.id ?? null)

  const generateTitle = !profile
    ? 'Load your profile first'
    : !hasPosts
      ? 'Gather posts first'
      : needsRefresh
        ? GENERATE_NEEDS_REFRESH_HINT
        : `Analyzes ${posts.length} stored posts (Venice tokens)`

  return (
    <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-white/80">Your intelligence report</h2>
        <span className="text-[10px] text-white/25 font-mono">{hasPosts ? `${posts.length} posts stored` : 'no posts yet'}</span>
        <div className="flex-1" />
        {active && account && (
          <ReportExportButton
            snapshot={active}
            username={account.username}
            profile={profile}
            posts={posts}
          />
        )}
        <button
          type="button"
          onClick={run}
          disabled={busy || !canGenerate}
          title={generateTitle}
          className="px-3 py-1 text-[11px] font-medium rounded-md bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {busy ? 'Generating…' : reportHistory.length > 0 ? 'Generate new report' : 'Generate report'}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-400/70">{error}</p>}

      <ReportTimeline
        history={reportHistory}
        activeId={active?.id ?? null}
        onSelect={(id) => activeAccountId && setActiveReport(activeAccountId, id)}
        onDelete={(id) => activeAccountId && deleteReport(activeAccountId, id)}
      />

      {active ? (
        <div className="space-y-5">
          {active.changeSummary && <ChangeSummaryPanel change={active.changeSummary} canAddTarget={false} />}
          <AnalyticsPanels a={active.analytics} posts={posts} onAddTarget={noAdd} />
          <div className="border-t border-white/[0.05] pt-4">
            <NarrativePanels snapshot={active} posts={posts} onJumpToPost={jumpToSelfFeedPost} canAddTarget={false} />
          </div>
          <p className="text-[10px] text-white/12 font-mono pt-2">
            Report {relDate(active.createdAt)} · {active.model} · {active.meta.postCount} posts
            {active.meta.tokenCost > 0 && ` · ${formatTokens(active.meta.tokenCost)} tokens`}
            {active.meta.promptTokens != null && active.meta.completionTokens != null &&
              ` (${formatTokens(active.meta.promptTokens)} in · ${formatTokens(active.meta.completionTokens)} out)`}
            {(active.meta.includedReportIds?.length ?? 0) > 0 &&
              ` · built on ${active.meta.includedReportIds!.length} prior report${active.meta.includedReportIds!.length === 1 ? '' : 's'}`}
          </p>
        </div>
      ) : liveAnalytics ? (
        <div className="space-y-5">
          <p className="text-[11px] text-white/30">
            Live analytics preview (computed, free). Generate a report to add analyst narrative and track changes over time.
          </p>
          <AnalyticsPanels a={liveAnalytics} posts={posts} onAddTarget={noAdd} />
        </div>
      ) : !hydrated || syncing ? (
        // Either the persist layer hasn't hydrated yet (reports may be about to
        // reappear from localStorage) or a sync is in flight (posts are still
        // being fetched, so live analytics can't be computed yet). In both cases
        // show a spinner rather than flashing "No report yet."
        <LoadingState
          className="py-16"
          label={syncing ? 'Syncing your data…' : 'Loading reports…'}
          size="sm"
          labelClassName="text-[11px] text-white/25"
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
          <p className="text-[12px] text-white/40 font-medium">No report yet</p>
          <p className="text-[11px] text-white/25 max-w-xs">Sync your data, then generate a report.</p>
        </div>
      )}

      {/* OAuth-only extras — saved & liked corpora */}
      {(bookmarks.length > 0 || likes.length > 0) && (
        <div className="border-t border-white/[0.05] pt-4 space-y-3">
          <ExtrasList title="Bookmarks" posts={bookmarks} empty="No bookmarks gathered" />
          <ExtrasList title="Likes" posts={likes} empty="No likes gathered" />
        </div>
      )}
    </div>
  )
}

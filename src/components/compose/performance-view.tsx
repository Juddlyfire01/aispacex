import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { findReportKey, useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { resolvePerformanceSubject } from '../../lib/compose/performance-context'
import {
  buildGlance,
  buildPatterns,
  buildTopPosts,
  type PerformanceRankMode,
  type PerformanceWindow,
} from '../../lib/x-intel/performance'
import { PerformanceControls } from './performance-controls'
import { PerformanceGlance } from './performance-glance'

function EmptyBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
      {children}
    </div>
  )
}

export function PerformanceView() {
  const activeThread = useComposeStore((s) =>
    s.activeThreadId ? s.threads[s.activeThreadId] : undefined,
  )
  const newThreadContext = useComposeStore((s) => s.newThreadContext)
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const selfAccount = useXSelfStore((s) =>
    s.activeAccountId ? s.accounts[s.activeAccountId] : undefined,
  )
  const reports = useXIntelStore((s) => s.reports)

  const [window, setWindow] = useState<PerformanceWindow>('30d')
  const [mode, setMode] = useState<PerformanceRankMode>('composite')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const subject = useMemo(
    () =>
      resolvePerformanceSubject({
        threadScope: activeThread?.context,
        newThreadContext,
        selfAccount: selfAccount
          ? {
              profile: selfAccount.profile,
              posts: selfAccount.posts,
              edges: selfAccount.edges ?? [],
            }
          : activeAccountId
            ? { profile: null, posts: [], edges: [] }
            : null,
        findReport: (username) => {
          const key = findReportKey(reports, username)
          if (!key) return null
          const r = reports[key]
          if (!r?.profile) return null
          return { profile: r.profile, posts: r.posts ?? [], edges: r.edges }
        },
      }),
    [activeThread?.context, newThreadContext, selfAccount, activeAccountId, reports],
  )

  const top = useMemo(() => {
    if (subject.status !== 'ok') return null
    return buildTopPosts({
      posts: subject.ownPosts,
      profile: subject.profile,
      window,
      mode,
      inbound: subject.inbound,
    })
  }, [subject, window, mode])

  const glance = useMemo(() => (top ? buildGlance(top) : null), [top])
  const patterns = useMemo(
    () => (top ? buildPatterns(top.candidates, top.mode, top.medians) : null),
    [top],
  )

  const subjectKey = subject.status === 'ok' ? subject.username : null

  useEffect(() => {
    setExpandedId(null)
  }, [subjectKey, window, mode])

  useEffect(() => {
    if (top?.items[0]) setExpandedId(top.items[0].post.id)
  }, [top])

  // expandedId kept for Task 6 (TopPostsList expand/collapse)
  void expandedId

  let body: ReactNode
  if (subject.status === 'need_profile') {
    body = (
      <EmptyBody>Pick You or a target in Composer settings to see Performance.</EmptyBody>
    )
  } else if (subject.status === 'no_posts') {
    body = (
      <EmptyBody>
        {`No posts in library for @${subject.username} — gather from You/Others.`}
      </EmptyBody>
    )
  } else if (subject.status === 'missing_target') {
    body = <EmptyBody>{`No report loaded for @${subject.username}.`}</EmptyBody>
  } else if (!top || top.candidates.length === 0) {
    body = <EmptyBody>No posts in this window — try 30d or All.</EmptyBody>
  } else if (mode === 'engagement_rate' && top.scored.length === 0 && top.candidates.length > 0) {
    body = (
      <EmptyBody>
        No posts with impressions in this window — try another rank mode.
      </EmptyBody>
    )
  } else {
    body = (
      <>
        {glance && <PerformanceGlance glance={glance} />}
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-secondary)]">
          Top posts ({top.items.length}) — list in next task
        </div>
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-secondary)]">
          {patterns?.caption ?? 'Patterns'}
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <PerformanceControls
        window={window}
        mode={mode}
        onWindow={setWindow}
        onMode={setMode}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>
    </div>
  )
}

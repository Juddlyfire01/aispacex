import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { findReportKey, useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import {
  resolvePerformanceSubject,
  selectionFromSubject,
  type PerformanceSelection,
  type SelfAccountSlice,
} from '../../lib/compose/performance-context'
import {
  buildCatalysts,
  buildDailySeries,
  buildGlance,
  buildTopPosts,
  defaultCustomRange,
  followersDeltaFromHistory,
  parseDateInputEndExclusive,
  parseDateInputStart,
  periodDaysForWindow,
  toDateInputValue,
  type MetricSnapshot,
  type PerformanceCustomRange,
  type PerformanceRankMode,
  type PerformanceWindow,
} from '../../lib/x-intel/performance'
import { PerformanceControls } from './performance-controls'
import { PerformanceGlance } from './performance-glance'
import { PerformanceChart } from './performance-chart'
import { PerformanceCatalysts } from './performance-catalysts'
import { TopPostsList } from './top-posts-list'

function EmptyBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
      {children}
    </div>
  )
}

function toSelfSlice(acc: {
  profile: SelfAccountSlice['profile']
  posts: SelfAccountSlice['posts']
  edges?: SelfAccountSlice['edges']
} | undefined): SelfAccountSlice | null {
  if (!acc) return null
  return {
    profile: acc.profile,
    posts: acc.posts,
    edges: acc.edges ?? [],
  }
}

export function PerformanceView({
  selection,
  onSelectionChange,
}: {
  selection: PerformanceSelection | null
  onSelectionChange: (next: PerformanceSelection | null) => void
}) {
  const activeThread = useComposeStore((s) =>
    s.activeThreadId ? s.threads[s.activeThreadId] : undefined,
  )
  const newThreadContext = useComposeStore((s) => s.newThreadContext)
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const accounts = useXSelfStore((s) => s.accounts)
  const accountOrder = useXSelfStore((s) => s.accountOrder)
  const reports = useXIntelStore((s) => s.reports)

  const [timeWindow, setTimeWindow] = useState<PerformanceWindow>('30d')
  const [mode, setMode] = useState<PerformanceRankMode>('composite')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const initialRange = useMemo(() => defaultCustomRange(), [])
  const [rangeFrom, setRangeFrom] = useState(() => toDateInputValue(initialRange.startMs))
  const [rangeTo, setRangeTo] = useState(() =>
    toDateInputValue(initialRange.endMs - 1),
  )

  const customRange = useMemo((): PerformanceCustomRange | null => {
    if (!rangeFrom || !rangeTo) return null
    const startMs = parseDateInputStart(rangeFrom)
    const endMs = parseDateInputEndExclusive(rangeTo)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
    return { startMs, endMs }
  }, [rangeFrom, rangeTo])

  const selfAccount = useMemo(
    () => toSelfSlice(activeAccountId ? accounts[activeAccountId] : undefined),
    [activeAccountId, accounts],
  )

  const getSelfAccount = useMemo(
    () => (accountId: string) => toSelfSlice(accounts[accountId]),
    [accounts],
  )

  const findReport = useMemo(
    () => (username: string) => {
      const key = findReportKey(reports, username)
      if (!key) return null
      const r = reports[key]
      if (!r?.profile) return null
      return { profile: r.profile, posts: r.posts ?? [], edges: r.edges }
    },
    [reports],
  )

  const subject = useMemo(
    () =>
      resolvePerformanceSubject({
        selection,
        threadScope: activeThread?.context,
        newThreadContext,
        selfAccount: selfAccount
          ? selfAccount
          : activeAccountId
            ? { profile: null, posts: [], edges: [] }
            : null,
        getSelfAccount,
        findReport,
      }),
    [
      selection,
      activeThread?.context,
      newThreadContext,
      selfAccount,
      activeAccountId,
      getSelfAccount,
      findReport,
    ],
  )

  const metricHistory: MetricSnapshot[] | undefined = useMemo(() => {
    if (selection?.kind === 'me') {
      return accounts[selection.accountId]?.metricHistory
    }
    if (subject.status === 'ok') {
      if (selection?.kind === 'target') {
        const key = findReportKey(reports, selection.username)
        return key ? reports[key]?.metricHistory : undefined
      }
      // Default self
      if (activeAccountId && accounts[activeAccountId]?.profile?.username.toLowerCase() === subject.username.toLowerCase()) {
        return accounts[activeAccountId]?.metricHistory
      }
      const key = findReportKey(reports, subject.username)
      return key ? reports[key]?.metricHistory : undefined
    }
    return undefined
  }, [selection, subject, accounts, activeAccountId, reports])

  useEffect(() => {
    if (selection) return
    const selfList = accountOrder
      .map((id) => {
        const a = accounts[id]
        return a?.username ? { id, username: a.username } : null
      })
      .filter(Boolean) as { id: string; username: string }[]
    const implied = selectionFromSubject(subject, selfList)
    if (implied) onSelectionChange(implied)
  }, [selection, subject, accountOrder, accounts, onSelectionChange])

  const top = useMemo(() => {
    if (subject.status !== 'ok') return null
    return buildTopPosts({
      posts: subject.ownPosts,
      profile: subject.profile,
      window: timeWindow,
      mode,
      range: customRange,
      inbound: subject.inbound,
    })
  }, [subject, timeWindow, mode, customRange])

  const followersDelta = useMemo(() => {
    if (subject.status !== 'ok') return null
    return followersDeltaFromHistory(
      metricHistory,
      periodDaysForWindow(timeWindow, customRange),
    )
  }, [subject, metricHistory, timeWindow, customRange])

  const glance = useMemo(() => {
    if (subject.status !== 'ok') return null
    return buildGlance({
      posts: subject.ownPosts,
      window: timeWindow,
      range: customRange,
      followers: subject.profile.metrics.followers,
      followersDelta,
    })
  }, [subject, timeWindow, customRange, followersDelta])

  const series = useMemo(() => {
    if (subject.status !== 'ok') return []
    return buildDailySeries(subject.ownPosts, timeWindow, mode, Date.now(), customRange)
  }, [subject, timeWindow, mode, customRange])

  const catalyst = useMemo(() => {
    if (subject.status !== 'ok') return null
    return buildCatalysts({
      posts: subject.ownPosts,
      window: timeWindow,
      range: customRange,
      followersDelta,
    })
  }, [subject, timeWindow, customRange, followersDelta])

  const subjectKey = subject.status === 'ok' ? subject.username : null
  const firstId = top?.items[0]?.post.id ?? null

  useEffect(() => {
    setExpandedId(firstId)
  }, [subjectKey, timeWindow, mode, customRange, firstId])

  let body: ReactNode
  if (subject.status === 'need_profile') {
    body = (
      <EmptyBody>Pick a profile in the rail (You or a target) to see Performance.</EmptyBody>
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
    body = (
      <EmptyBody>
        {timeWindow === 'range'
          ? 'No posts in this date range — widen From/To or try 30d / All.'
          : 'No posts in this window — try 30d or All.'}
      </EmptyBody>
    )
  } else {
    body = (
      <>
        {glance && <PerformanceGlance glance={glance} />}
        <PerformanceChart series={series} mode={mode} />
        <section className="px-4 pt-1 pb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Top posts
            {subjectKey ? (
              <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--color-text-tertiary)]">
                @{subjectKey}
              </span>
            ) : null}
          </h3>
          <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
            Sorted high → low by {mode === 'composite' ? 'IntelX score' : mode}
            {' · '}pure retweets excluded
            {mode === 'composite' ? ' · approximation (not X live ranking)' : ''}
          </p>
        </section>
        <TopPostsList
          items={top.items}
          mode={mode}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
        />
        {catalyst && <PerformanceCatalysts catalyst={catalyst} />}
      </>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <PerformanceControls
        window={timeWindow}
        mode={mode}
        onWindow={setTimeWindow}
        onMode={setMode}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
        onRangeFrom={setRangeFrom}
        onRangeTo={setRangeTo}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>
    </div>
  )
}

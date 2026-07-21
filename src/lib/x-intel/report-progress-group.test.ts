import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../stores/toast-store'
import { __resetReportGroupForTests, joinReportGroup } from './report-progress-group'

function toasts() {
  return useToastStore.getState().toasts
}
function only() {
  const t = toasts()
  expect(t).toHaveLength(1)
  return t[0]
}

describe('report progress group', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetReportGroupForTests()
    useToastStore.setState({ toasts: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
    __resetReportGroupForTests()
    useToastStore.setState({ toasts: [] })
  })

  it('single job renders as a plain per-report toast', () => {
    const job = joinReportGroup('@alice', '1/4 · Computing analytics…')
    const t = only()
    expect(t.title).toBe('Generating report')
    expect(t.description).toBe('@alice')
    expect(t.progressLabel).toBe('1/4 · Computing analytics…')

    job.setProgress(0.5, '4/4 · Writing narrative… ~50%')
    expect(only().progress).toBe(0.5)
    expect(only().progressLabel).toContain('Writing narrative')
  })

  it('multiple concurrent jobs coalesce into ONE aggregate toast', () => {
    const a = joinReportGroup('@alice', '1/4 · Computing…')
    const b = joinReportGroup('@bob', '1/4 · Computing…')
    joinReportGroup('@carol', '1/4 · Computing…')
    joinReportGroup('@dave', '1/4 · Computing…')

    // Four jobs, still a single toast.
    const t = only()
    expect(t.title).toBe('Generating 4 reports')
    expect(t.progressLabel).toContain('Running 4 of 4')

    // Averaged bar: push two jobs to 0.5, others stay at 0.02.
    a.setProgress(0.5, 'x')
    b.setProgress(0.5, 'x')
    const expected = (0.5 + 0.5 + 0.02 + 0.02) / 4
    expect(only().progress).toBeCloseTo(expected, 5)
  })

  it('reflects completed count while others still run', () => {
    const a = joinReportGroup('@alice', 'x')
    joinReportGroup('@bob', 'x')
    a.complete('Report ready', '@alice · done')

    const t = only()
    expect(t.title).toBe('Generating 2 reports')
    expect(t.progressLabel).toContain('1 of 2 complete')
    // Settled member counts as full progress in the average.
    expect(t.progress).toBeCloseTo((1 + 0.02) / 2, 5)
  })

  it('all success → success summary, then auto-dismiss and reset', () => {
    const a = joinReportGroup('@alice', 'x')
    const b = joinReportGroup('@bob', 'x')
    a.complete('Report ready', '@alice')
    b.complete('Report ready', '@bob')

    const t = only()
    expect(t.variant).toBe('success')
    expect(t.title).toBe('2 reports ready')
    expect(t.progress).toBe(1)

    vi.advanceTimersByTime(4500) // success linger + auto-dismiss
    expect(toasts()).toHaveLength(0)

    // A fresh wave starts a brand-new toast, not a revived settled one.
    joinReportGroup('@erin', 'x')
    expect(only().title).toBe('Generating report')
  })

  it('mixed outcome leads with failures', () => {
    const a = joinReportGroup('@alice', 'x')
    const b = joinReportGroup('@bob', 'x')
    a.complete('Report ready', '@alice')
    b.fail('Report failed', 'Venice timed out')

    const t = only()
    expect(t.variant).toBe('error')
    expect(t.title).toBe('1 ready · 1 failed')
    expect(t.description).toContain('@bob')
  })

  it('single job failure preserves the legacy fail surface', () => {
    const a = joinReportGroup('@alice', 'x')
    a.fail('Report failed', 'boom')
    const t = only()
    expect(t.variant).toBe('error')
    expect(t.title).toBe('Report failed')
    expect(t.description).toBe('boom')
    expect(t.duration).toBe(12_000)
  })

  it('a job joining during settle linger starts a fresh group', () => {
    const a = joinReportGroup('@alice', 'x')
    a.complete('Report ready', '@alice')
    expect(only().variant).toBe('success')

    // Join before the linger elapses — must not fold into the settled toast.
    const b = joinReportGroup('@bob', '1/4 · Computing…')
    expect(b.jobId).toBeGreaterThan(a.jobId)
    // New running toast exists (old one may still be lingering until dismissed).
    const running = toasts().find((t) => t.variant === 'progress')
    expect(running?.description).toBe('@bob')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../stores/toast-store'
import { beginReportProgress } from './report-progress'

function labelOf(id: number): string | undefined {
  return useToastStore.getState().toasts.find((t) => t.id === id)?.progressLabel
}

function progressOf(id: number): number | undefined {
  return useToastStore.getState().toasts.find((t) => t.id === id)?.progress
}

describe('beginReportProgress pre-stream holds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
    useToastStore.setState({ toasts: [] })
  })

  it('advances numbered stages with one continuous bar', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    expect(labelOf(p.toastId)).toBe('1/4 · Computing analytics…')
    const start = progressOf(p.toastId)!
    expect(start).toBeGreaterThan(0)

    vi.advanceTimersByTime(999)
    expect(labelOf(p.toastId)).toBe('1/4 · Computing analytics…')
    const midCompute = progressOf(p.toastId)!
    expect(midCompute).toBeGreaterThan(start)

    vi.advanceTimersByTime(1)
    expect(labelOf(p.toastId)).toBe('2/4 · Sending request…')

    vi.advanceTimersByTime(1999)
    expect(labelOf(p.toastId)).toBe('2/4 · Sending request…')
    expect(progressOf(p.toastId)!).toBeGreaterThan(midCompute)

    vi.advanceTimersByTime(1)
    expect(labelOf(p.toastId)).toBe('3/4 · Waiting for first tokens…')
    expect(progressOf(p.toastId)!).toBeGreaterThan(0.1)
  })

  it('numbers writing as stage 4 and keeps bar monotonic', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    p.onStreamTokens('narrative', 0, 1000)
    expect(labelOf(p.toastId)).toMatch(/^1\/4/)

    vi.advanceTimersByTime(1000)
    expect(labelOf(p.toastId)).toMatch(/^2\/4/)
    const beforeWrite = progressOf(p.toastId)!

    p.onStreamTokens('narrative', 10, 1000)
    expect(labelOf(p.toastId)).toMatch(/^4\/4 · Writing narrative/)
    expect(progressOf(p.toastId)!).toBeGreaterThanOrEqual(beforeWrite)
  })

  it('numbers summarizing as stage 5 when change step exists', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: true })
    p.markPrepare()
    p.onStreamTokens('narrative', 100, 1000)
    expect(labelOf(p.toastId)).toMatch(/^4\/5 · Writing narrative/)
    const afterNarr = progressOf(p.toastId)!

    p.markPhase('change')
    p.onStreamTokens('change', 50, 500)
    expect(labelOf(p.toastId)).toMatch(/^5\/5 · Summarizing changes/)
    expect(progressOf(p.toastId)!).toBeGreaterThanOrEqual(afterNarr)
  })

  it('zero-token probe leaves Waiting hold intact until real tokens', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    p.onStreamTokens('narrative', 0, 1000)
    vi.advanceTimersByTime(3000)
    expect(labelOf(p.toastId)).toBe('3/4 · Waiting for first tokens…')
    p.onStreamTokens('narrative', 40, 1000)
    expect(labelOf(p.toastId)).toMatch(/^4\/4 · Writing narrative/)
  })

  it('fail clears timers so later ticks do not revive the toast label', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    p.fail('Report failed', 'boom')
    vi.advanceTimersByTime(5000)
    const t = useToastStore.getState().toasts.find((x) => x.id === p.toastId)
    expect(t?.variant).toBe('error')
    expect(t?.progressLabel).toBeUndefined()
  })
})

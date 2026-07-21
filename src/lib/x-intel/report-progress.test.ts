import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../stores/toast-store'
import { beginReportProgress } from './report-progress'
import { __resetReportGroupForTests } from './report-progress-group'

function labelOf(id: number): string | undefined {
  return useToastStore.getState().toasts.find((t) => t.id === id)?.progressLabel
}

function progressOf(id: number): number | undefined {
  return useToastStore.getState().toasts.find((t) => t.id === id)?.progress
}

/** markPrepare defers the stage clock until after mount (setTimeout 0). */
async function prepare(p: ReturnType<typeof beginReportProgress>) {
  const done = p.markPrepare()
  await vi.advanceTimersByTimeAsync(0)
  await done
}

describe('beginReportProgress pre-stream holds', () => {
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

  it('does not start the stage clock until after mount', async () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    expect(labelOf(p.toastId)).toBe('1/4 · Computing analytics…')

    // Sync work before await markPrepare must not burn stage 1.
    vi.advanceTimersByTime(5000)
    expect(labelOf(p.toastId)).toBe('1/4 · Computing analytics…')

    await prepare(p)
    expect(labelOf(p.toastId)).toBe('1/4 · Computing analytics…')

    vi.advanceTimersByTime(2999)
    expect(labelOf(p.toastId)).toBe('1/4 · Computing analytics…')
    vi.advanceTimersByTime(1)
    expect(labelOf(p.toastId)).toBe('2/4 · Sending request…')
  })

  it('advances numbered stages with one continuous bar', async () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    await prepare(p)
    expect(labelOf(p.toastId)).toBe('1/4 · Computing analytics…')
    const start = progressOf(p.toastId)!
    expect(start).toBeGreaterThan(0)

    vi.advanceTimersByTime(2999)
    expect(labelOf(p.toastId)).toBe('1/4 · Computing analytics…')
    const midCompute = progressOf(p.toastId)!
    expect(midCompute).toBeGreaterThan(start)

    vi.advanceTimersByTime(1)
    expect(labelOf(p.toastId)).toBe('2/4 · Sending request…')

    vi.advanceTimersByTime(2999)
    expect(labelOf(p.toastId)).toBe('2/4 · Sending request…')
    expect(progressOf(p.toastId)!).toBeGreaterThan(midCompute)

    vi.advanceTimersByTime(1)
    expect(labelOf(p.toastId)).toBe('3/4 · Thinking…')
    expect(progressOf(p.toastId)!).toBeGreaterThan(0.1)
  })

  it('numbers writing as stage 4 and keeps bar monotonic', async () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    await prepare(p)
    p.onStreamTokens('narrative', 0, 1000)
    expect(labelOf(p.toastId)).toMatch(/^1\/4/)

    vi.advanceTimersByTime(3000)
    expect(labelOf(p.toastId)).toMatch(/^2\/4/)
    const beforeWrite = progressOf(p.toastId)!

    p.onStreamTokens('narrative', 10, 1000)
    expect(labelOf(p.toastId)).toMatch(/^4\/4 · Writing narrative/)
    expect(progressOf(p.toastId)!).toBeGreaterThanOrEqual(beforeWrite)
  })

  it('bridges Writing → Thinking → Summarizing when change step exists', async () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: true })
    await prepare(p)
    p.onStreamTokens('narrative', 900, 1000)
    expect(labelOf(p.toastId)).toMatch(/^4\/6 · Writing narrative/)
    const afterNarr = progressOf(p.toastId)!
    const narrPct = Math.round(afterNarr * 100)
    expect(narrPct).toBeGreaterThan(50)

    p.markPhase('change')
    // Zero-token probe must not skip the Thinking bridge.
    p.onStreamTokens('change', 0, 500)
    expect(labelOf(p.toastId)).toBe('5/6 · Thinking…')
    expect(progressOf(p.toastId)!).toBeGreaterThanOrEqual(afterNarr)

    vi.advanceTimersByTime(500)
    expect(labelOf(p.toastId)).toBe('5/6 · Thinking…')

    p.onStreamTokens('change', 50, 500)
    expect(labelOf(p.toastId)).toMatch(/^6\/6 · Summarizing changes/)
    expect(progressOf(p.toastId)!).toBeGreaterThanOrEqual(afterNarr)
    const sumPct = Math.round(progressOf(p.toastId)! * 100)
    expect(sumPct).toBeGreaterThanOrEqual(narrPct)
    expect(labelOf(p.toastId)).toContain(`~${sumPct}%`)
  })

  it('zero-token probe leaves Thinking hold intact until real tokens', async () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    await prepare(p)
    p.onStreamTokens('narrative', 0, 1000)
    vi.advanceTimersByTime(6000)
    expect(labelOf(p.toastId)).toBe('3/4 · Thinking…')
    p.onStreamTokens('narrative', 40, 1000)
    expect(labelOf(p.toastId)).toMatch(/^4\/4 · Writing narrative/)
  })

  it('fail clears timers so later ticks do not revive the toast label', async () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    await prepare(p)
    p.fail('Report failed', 'boom')
    vi.advanceTimersByTime(5000)
    const t = useToastStore.getState().toasts.find((x) => x.id === p.toastId)
    expect(t?.variant).toBe('error')
    expect(t?.title).toBe('Report failed')
    // Stuck on the fail outcome — pre-stream ticks must not overwrite it.
    expect(t?.progressLabel).toBe('Failed')
  })
})

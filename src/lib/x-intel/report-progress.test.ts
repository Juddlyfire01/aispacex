import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../stores/toast-store'
import { beginReportProgress } from './report-progress'

function labelOf(id: number): string | undefined {
  return useToastStore.getState().toasts.find((t) => t.id === id)?.progressLabel
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

  it('advances Computing → Sending → Waiting on the hold schedule', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    expect(labelOf(p.toastId)).toBe('Computing…')

    vi.advanceTimersByTime(999)
    expect(labelOf(p.toastId)).toBe('Computing…')
    vi.advanceTimersByTime(1)
    expect(labelOf(p.toastId)).toBe('Sending…')

    vi.advanceTimersByTime(1999)
    expect(labelOf(p.toastId)).toBe('Sending…')
    vi.advanceTimersByTime(1)
    expect(labelOf(p.toastId)).toBe('Waiting…')
  })

  it('first stream token cancels remaining holds and shows writing label', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    p.markPhase('narrative')
    // synthesize's pre-flight 0-token probe must not kill the holds
    p.onStreamTokens('narrative', 0, 1000)
    expect(labelOf(p.toastId)).toBe('Computing…')

    vi.advanceTimersByTime(1000)
    expect(labelOf(p.toastId)).toBe('Sending…')

    p.onStreamTokens('narrative', 10, 1000)
    expect(labelOf(p.toastId)).toMatch(/Writing narrative/)

    vi.advanceTimersByTime(5000)
    expect(labelOf(p.toastId)).toMatch(/Writing narrative/)
  })

  it('zero-token probe leaves Waiting hold intact until real tokens', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    p.onStreamTokens('narrative', 0, 1000)
    vi.advanceTimersByTime(3000)
    expect(labelOf(p.toastId)).toBe('Waiting…')
    p.onStreamTokens('narrative', 40, 1000)
    expect(labelOf(p.toastId)).toMatch(/Writing narrative/)
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

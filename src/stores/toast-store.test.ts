import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast, useToastStore } from './toast-store'

describe('toast store progress lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('progress toast stays until complete, then auto-dismisses', () => {
    const id = toast.progress('Generating report', {
      description: '@alice',
      progress: 0.2,
      progressLabel: 'Step 1 of 2 · Computing analytics',
    })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0].variant).toBe('progress')
    expect(useToastStore.getState().toasts[0].duration).toBe(0)

    toast.update(id, {
      progress: 0.55,
      progressLabel: 'Step 2 of 2 · Writing narrative',
    })
    expect(useToastStore.getState().toasts[0].progress).toBe(0.55)
    expect(useToastStore.getState().toasts[0].progressLabel).toContain('Writing narrative')

    toast.complete(id, 'Report ready', '@alice · 12 posts analyzed')
    const done = useToastStore.getState().toasts[0]
    expect(done.variant).toBe('success')
    expect(done.title).toBe('Report ready')
    expect(done.progress).toBe(1)
    expect(done.duration).toBe(4500)

    vi.advanceTimersByTime(4500)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('fail turns progress toast into an error that auto-dismisses', () => {
    const id = toast.progress('Generating report')
    toast.fail(id, 'Report failed', 'Venice timed out')
    const failed = useToastStore.getState().toasts[0]
    expect(failed.variant).toBe('error')
    expect(failed.description).toBe('Venice timed out')
    expect(failed.progress).toBeUndefined()

    vi.advanceTimersByTime(6500)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('update/complete/fail are no-ops after dismiss', () => {
    const id = toast.progress('Generating report')
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)

    toast.update(id, { progress: 0.9 })
    toast.complete(id, 'Report ready')
    toast.fail(id, 'Report failed')
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

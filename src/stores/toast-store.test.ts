import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VeniceAPIError } from '../lib/venice-client'
import {
  debugErrorText,
  humanErrorDescription,
  toast,
  useToastStore,
} from './toast-store'

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
    expect(done.progressLabel).toBe('Complete')
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
    expect(failed.progress).toBe(1)
    expect(failed.progressLabel).toBe('Failed')
    expect(failed.duration).toBe(12_000)

    vi.advanceTimersByTime(12_000)
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

  it('caps the stack at 3 toasts, dropping the oldest', () => {
    toast.info('One')
    toast.info('Two')
    toast.info('Three')
    toast.info('Four')
    const titles = useToastStore.getState().toasts.map((t) => t.title)
    expect(titles).toEqual(['Two', 'Three', 'Four'])
  })

  it('never evicts a live progress toast — drops the oldest auto-dismiss toast instead', () => {
    const p1 = toast.progress('Report A')
    const p2 = toast.progress('Report B')
    toast.info('Ping') // 3rd slot, auto-dismissable
    toast.progress('Report C') // overflow: must drop "Ping", keep both progress jobs

    const titles = useToastStore.getState().toasts.map((t) => t.title)
    expect(titles).toEqual(['Report A', 'Report B', 'Report C'])
    // Earliest jobs survived, so their completion still lands.
    expect(useToastStore.getState().toasts.find((t) => t.id === p1)).toBeDefined()
    expect(useToastStore.getState().toasts.find((t) => t.id === p2)).toBeDefined()
  })

  it('lets the stack exceed the cap when every toast is a live job', () => {
    const ids = [
      toast.progress('Report A'),
      toast.progress('Report B'),
      toast.progress('Report C'),
      toast.progress('Report D'),
    ]
    expect(useToastStore.getState().toasts).toHaveLength(4)

    // The 4th job's completion is NOT a no-op — it was never evicted.
    toast.complete(ids[3], 'Report ready', 'Report D · done')
    const d = useToastStore.getState().toasts.find((t) => t.id === ids[3])!
    expect(d.variant).toBe('success')
    expect(d.progress).toBe(1)
  })
})

describe('toast.fromError / generation errors', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })

  it('prefers Zod issues for the human description', () => {
    const err = new VeniceAPIError('Invalid request', 400, 'VALIDATION', undefined, [
      'prompt must be at least 10 characters',
    ])
    expect(humanErrorDescription(err)).toBe('prompt must be at least 10 characters')
  })

  it('falls back to Request rejected when message is bare HTTP status', () => {
    const err = new VeniceAPIError('HTTP 400', 400)
    expect(humanErrorDescription(err)).toBe('Request rejected (400)')
  })

  it('includes status, code, and issues in the copy payload', () => {
    const err = new VeniceAPIError('Invalid request', 400, 'VALIDATION', 'try a longer prompt', [
      'prompt too short',
    ])
    const copy = debugErrorText(err)!
    expect(copy).toContain('status: 400')
    expect(copy).toContain('code: VALIDATION')
    expect(copy).toContain('prompt too short')
    expect(copy).toContain('suggestedPrompt: try a longer prompt')
  })

  it('fromError and generationError push the same copyable error toast', () => {
    const err = new VeniceAPIError('bad', 422, 'CONTENT')
    toast.fromError(err, 'Video failed')
    const t = useToastStore.getState().toasts[0]
    expect(t.variant).toBe('error')
    expect(t.title).toBe('Video failed')
    expect(t.description).toBe('bad')
    expect(t.copyError).toContain('code: CONTENT')
    expect(t.copyError).toContain('status: 422')

    useToastStore.setState({ toasts: [] })
    toast.generationError(err, 'Music failed')
    expect(useToastStore.getState().toasts[0].title).toBe('Music failed')
  })

  it('fromError skips PaidNotReadyError (gate already toasted)', () => {
    const err = new Error('Paid mode requires a wallet sign-in')
    err.name = 'PaidNotReadyError'
    const id = toast.fromError(err, 'Image failed')
    expect(id).toBe(-1)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

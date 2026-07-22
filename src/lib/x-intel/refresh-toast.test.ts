import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withRefreshToast } from './refresh-toast'
import { PaidNotReadyError } from '../x402/charge-flow'
import { toast, useToastStore } from '../../stores/toast-store'

describe('withRefreshToast', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.restoreAllMocks()
  })

  it('completes only after the action succeeds', async () => {
    const complete = vi.spyOn(toast, 'complete')
    await withRefreshToast('@alice', async () => undefined, 'Profile up to date')
    expect(complete).toHaveBeenCalledWith(expect.any(Number), 'Profile up to date', '@alice')
    expect(useToastStore.getState().toasts.some((t) => t.variant === 'success')).toBe(true)
  })

  it('does not complete when paid mode blocks the action', async () => {
    const complete = vi.spyOn(toast, 'complete')
    const dismiss = vi.spyOn(toast, 'dismiss')
    await expect(
      withRefreshToast('@alice', async () => {
        throw new PaidNotReadyError('needs_wallet')
      }, 'Profile up to date'),
    ).rejects.toBeInstanceOf(PaidNotReadyError)
    expect(complete).not.toHaveBeenCalled()
    expect(dismiss).toHaveBeenCalled()
    expect(useToastStore.getState().toasts.some((t) => t.variant === 'success')).toBe(false)
  })

  it('fails the progress toast on other errors', async () => {
    const fail = vi.spyOn(toast, 'fail')
    await expect(
      withRefreshToast('@alice', async () => {
        throw new Error('network down')
      }),
    ).rejects.toThrow(/network down/)
    expect(fail).toHaveBeenCalledWith(expect.any(Number), 'Refresh failed', 'network down')
  })
})

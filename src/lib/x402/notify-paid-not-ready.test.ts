import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>()
  return { ...actual, X402_ENABLED: true, X402_DISABLE_FREE: true }
})

const toastError = vi.fn()
vi.mock('../../stores/toast-store', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn(), info: vi.fn() },
}))

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({ openSettings: vi.fn() }),
  },
}))

import { notifyPaidNotReady, resetPaidNotReadyDedupe } from './notify-paid-not-ready'

describe('notifyPaidNotReady dedupe', () => {
  beforeEach(() => {
    resetPaidNotReadyDedupe()
    toastError.mockClear()
  })

  it('shows one toast when the same reason fires twice quickly', () => {
    notifyPaidNotReady('needs_wallet')
    notifyPaidNotReady('needs_wallet')
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it('allows a second toast after the dedupe window', () => {
    notifyPaidNotReady('needs_wallet')
    resetPaidNotReadyDedupe()
    notifyPaidNotReady('needs_wallet')
    expect(toastError).toHaveBeenCalledTimes(2)
  })
})

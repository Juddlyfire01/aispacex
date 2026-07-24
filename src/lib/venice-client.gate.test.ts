import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./x402/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./x402/config')>()
  return {
    ...actual,
    X402_ENABLED: true,
    X402_DISABLE_FREE: true,
  }
})

vi.mock('./x402/notify-paid-not-ready', () => ({
  notifyPaidNotReady: vi.fn(),
}))

import { veniceFetch } from './venice-client'
import { PaidNotReadyError } from './x402/charge-flow'
import { useX402Store } from '../stores/x402-store'

describe('veniceFetch credits gate', () => {
  beforeEach(() => {
    useX402Store.setState({
      address: '0xabc',
      status: 'connected',
      sessionToken: null,
      sessionExpiresAt: null,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    )
  })

  it('blocks billable Venice calls when wallet is linked but not signed in', async () => {
    await expect(
      veniceFetch('/chat/completions', { method: 'POST', body: '{}' }),
    ).rejects.toBeInstanceOf(PaidNotReadyError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('still allows catalog (noAuth) fetches without a SIWE session', async () => {
    const res = await veniceFetch('/models?type=text', { noAuth: true })
    expect(res.ok).toBe(true)
    expect(fetch).toHaveBeenCalled()
  })

  it('allows billable calls when SIWE session is valid', async () => {
    useX402Store.setState({
      sessionToken: 'tok',
      sessionExpiresAt: Date.now() + 60_000,
    })
    const res = await veniceFetch('/chat/completions', { method: 'POST', body: '{}' })
    expect(res.ok).toBe(true)
    expect(fetch).toHaveBeenCalled()
  })
})

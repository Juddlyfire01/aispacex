import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VENICE_FRONTED_SENTINEL } from '../venice-config'

const configFlags = vi.hoisted(() => ({
  disableFree: false,
}))

vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>()
  return {
    ...actual,
    X402_ENABLED: true,
    get X402_DISABLE_FREE() {
      return configFlags.disableFree
    },
  }
})

vi.mock('./notify-paid-not-ready', () => ({
  notifyPaidNotReady: vi.fn(),
}))

import {
  rawCostForAction,
  chargeAction,
  previewChargedUsd,
  runPaidAction,
  markActionStart,
  getPaidReadiness,
  ensurePaidReady,
  isPaidModeActive,
  assertPaidReady,
  PaidNotReadyError,
} from './charge-flow'
import { useCostLedgerStore } from '../../stores/cost-ledger-store'
import { useX402Store } from '../../stores/x402-store'
import { useAuthStore } from '../../stores/auth-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { X402_MARGIN } from './config'
import { notifyPaidNotReady } from './notify-paid-not-ready'

function seedEntry(action: string, rawUsd: number) {
  useCostLedgerStore.getState().recordCost({
    action,
    provider: 'x',
    kind: 'posts',
    units: 1,
    unitPriceUsd: rawUsd,
    rawUsd,
  })
}

function resetX402(partial: Partial<ReturnType<typeof useX402Store.getState>> = {}) {
  useX402Store.setState({
    address: null,
    status: 'idle',
    error: null,
    balanceUsd: 0,
    ledger: [],
    sessionToken: null,
    sessionExpiresAt: null,
    ...partial,
  })
}

function resetAuth(apiKey: string | null = VENICE_FRONTED_SENTINEL) {
  useAuthStore.setState({ apiKey })
}

function resetXSelf(connected = false) {
  useXSelfStore.setState({ connected })
}

describe('rawCostForAction', () => {
  beforeEach(() => {
    useCostLedgerStore.setState({ entries: [], session: { x: 0, venice: 0 }, lifetime: { x: 0, venice: 0 } })
  })

  it('sums only entries for the given action', () => {
    seedEntry('report:alice', 0.05)
    seedEntry('report:alice', 0.03)
    seedEntry('report:bob', 0.10)
    expect(rawCostForAction('report:alice')).toBeCloseTo(0.08)
    expect(rawCostForAction('report:bob')).toBeCloseTo(0.10)
  })

  it('respects the sinceTs cutoff', () => {
    seedEntry('report:alice', 0.05)
    const cutoff = Date.now() + 1
    expect(rawCostForAction('report:alice', cutoff)).toBe(0)
  })
})

describe('getPaidReadiness / ensurePaidReady', () => {
  beforeEach(() => {
    configFlags.disableFree = false
    resetX402()
    resetAuth()
    resetXSelf(false)
    vi.mocked(notifyPaidNotReady).mockClear()
  })

  it('is off (Free) when no wallet is connected', () => {
    expect(getPaidReadiness()).toBe('off')
    expect(ensurePaidReady()).toBe(true)
    expect(isPaidModeActive()).toBe(false)
  })

  it('needs_session when wallet connected but no SIWE token', () => {
    resetX402({ address: '0xabc', status: 'connected' })
    expect(getPaidReadiness()).toBe('needs_session')
    expect(ensurePaidReady()).toBe(false)
    expect(notifyPaidNotReady).toHaveBeenCalledWith('needs_session')
  })

  it('is ready when connected with a valid session', () => {
    resetX402({
      address: '0xabc',
      status: 'connected',
      sessionToken: 'tok',
      sessionExpiresAt: Date.now() + 60_000,
    })
    expect(getPaidReadiness()).toBe('ready')
    expect(ensurePaidReady()).toBe(true)
    expect(isPaidModeActive()).toBe(true)
  })

  it('DISABLE_FREE blocks Free when no wallet and no BYOK', () => {
    configFlags.disableFree = true
    expect(getPaidReadiness()).toBe('off')
    expect(ensurePaidReady()).toBe(false)
    expect(notifyPaidNotReady).toHaveBeenCalledWith('needs_wallet')
    expect(() => assertPaidReady()).toThrow(PaidNotReadyError)
  })

  it('DISABLE_FREE blocks Intel when only Venice BYOK (app X bearer still Free)', () => {
    configFlags.disableFree = true
    resetAuth('vv_user_key_abc')
    expect(ensurePaidReady()).toBe(false)
    expect(() => assertPaidReady()).toThrow(PaidNotReadyError)
  })

  it('DISABLE_FREE allows Intel with Venice BYOK + X OAuth', () => {
    configFlags.disableFree = true
    resetAuth('vv_user_key_abc')
    resetXSelf(true)
    expect(ensurePaidReady()).toBe(true)
    expect(notifyPaidNotReady).not.toHaveBeenCalled()
  })

  it('DISABLE_FREE allows venice rail with Venice BYOK only', () => {
    configFlags.disableFree = true
    resetAuth('vv_user_key_abc')
    expect(ensurePaidReady({ rail: 'venice' })).toBe(true)
  })

  it('DISABLE_FREE allows paid-ready wallet session', () => {
    configFlags.disableFree = true
    resetX402({
      address: '0xabc',
      status: 'connected',
      sessionToken: 'tok',
      sessionExpiresAt: Date.now() + 60_000,
    })
    expect(ensurePaidReady()).toBe(true)
  })
})

describe('runPaidAction', () => {
  beforeEach(() => {
    configFlags.disableFree = false
    useCostLedgerStore.setState({ entries: [], session: { x: 0, venice: 0 }, lifetime: { x: 0, venice: 0 } })
    resetX402()
    resetAuth()
    resetXSelf(false)
    vi.mocked(notifyPaidNotReady).mockClear()
  })

  it('is a transparent pass-through when no wallet (Free)', async () => {
    const { result, charge } = await runPaidAction('act', async () => {
      seedEntry('act', 0.2)
      return 42
    })
    expect(result).toBe(42)
    expect(charge.charged).toBe(false)
    expect(charge.rawUsd).toBeCloseTo(0.2)
  })

  it('blocks before running when connected wallet needs SIWE', async () => {
    resetX402({ address: '0xabc', status: 'connected' })
    const fn = vi.fn(async () => 1)
    await expect(runPaidAction('act', fn)).rejects.toThrow(/sign-in/i)
    expect(fn).not.toHaveBeenCalled()
  })

  it('assertPaidReady throws when connected without session', () => {
    resetX402({ address: '0xabc', status: 'connected' })
    expect(() => assertPaidReady()).toThrow(PaidNotReadyError)
  })

  it('markActionStart returns a finite timestamp', () => {
    expect(Number.isFinite(markActionStart())).toBe(true)
  })
})

describe('chargeAction', () => {
  beforeEach(() => {
    configFlags.disableFree = false
    useCostLedgerStore.setState({ entries: [], session: { x: 0, venice: 0 }, lifetime: { x: 0, venice: 0 } })
    resetX402()
    resetAuth()
    resetXSelf(false)
  })

  it('no-ops (charged:false) when no wallet (Free)', async () => {
    seedEntry('act', 0.1)
    const result = await chargeAction('act')
    expect(result.charged).toBe(false)
    expect(result.rawUsd).toBeCloseTo(0.1)
    expect(result.chargedUsd).toBeCloseTo(0.1 * X402_MARGIN)
  })

  it('returns needs_session when connected but no valid token', async () => {
    resetX402({ address: '0xabc', status: 'connected' })
    seedEntry('act', 0.1)
    const result = await chargeAction('act')
    expect(result.charged).toBe(false)
    expect(result.error).toBe('needs_session')
  })

  it('mirrors server balanceAfterUsd once (no double-debit)', async () => {
    resetX402({
      address: '0xabc',
      status: 'connected',
      balanceUsd: 10,
      sessionToken: 'tok',
      sessionExpiresAt: Date.now() + 60_000,
    })
    seedEntry('act', 0.1)
    const chargedUsd = 0.1 * X402_MARGIN
    const balanceAfterUsd = 9.785815
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: true, chargedUsd, balanceAfterUsd }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    const result = await chargeAction('act')
    expect(result.charged).toBe(true)
    expect(useX402Store.getState().balanceUsd).toBeCloseTo(balanceAfterUsd)
    expect(useX402Store.getState().sessionChargedUsd).toBeCloseTo(chargedUsd)
    vi.unstubAllGlobals()
  })

  it('previewChargedUsd is 0 when no wallet', () => {
    expect(previewChargedUsd(1)).toBe(0)
  })
})

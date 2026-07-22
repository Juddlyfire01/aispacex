import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>()
  return { ...actual, X402_ENABLED: true }
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
    resetX402()
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
})

describe('runPaidAction', () => {
  beforeEach(() => {
    useCostLedgerStore.setState({ entries: [], session: { x: 0, venice: 0 }, lifetime: { x: 0, venice: 0 } })
    resetX402()
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
    useCostLedgerStore.setState({ entries: [], session: { x: 0, venice: 0 }, lifetime: { x: 0, venice: 0 } })
    resetX402()
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

  it('previewChargedUsd is 0 when no wallet', () => {
    expect(previewChargedUsd(1)).toBe(0)
  })
})

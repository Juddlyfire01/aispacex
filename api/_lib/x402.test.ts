import { describe, it, expect, beforeEach } from 'vitest'
import { buildPaymentRequired, minTopUpUsd, receiverWallet, balanceRawToUsd } from './x402'

describe('minTopUpUsd', () => {
  beforeEach(() => {
    delete process.env.X402_MIN_TOPUP_USD
    delete process.env.VITE_X402_MIN_TOPUP_USD
  })
  it('defaults to 5', () => {
    expect(minTopUpUsd()).toBe(5)
  })
  it('reads the env override', () => {
    process.env.X402_MIN_TOPUP_USD = '10'
    expect(minTopUpUsd()).toBe(10)
  })
  it('ignores non-positive overrides', () => {
    process.env.X402_MIN_TOPUP_USD = '0'
    expect(minTopUpUsd()).toBe(5)
  })
})

describe('receiverWallet', () => {
  beforeEach(() => {
    delete process.env.X402_RECEIVER_WALLET
    delete process.env.VITE_X402_RECEIVER_WALLET
  })
  it('returns empty when unset', () => {
    expect(receiverWallet()).toBe('')
  })
  it('trims the configured wallet', () => {
    process.env.X402_RECEIVER_WALLET = '  0xabc  '
    expect(receiverWallet()).toBe('0xabc')
  })
})

describe('balanceRawToUsd', () => {
  it('converts micro-USD integers to dollars', () => {
    expect(balanceRawToUsd(1_919_000)).toBeCloseTo(1.919)
    expect(balanceRawToUsd('5000000')).toBe(5)
    expect(balanceRawToUsd(0)).toBe(0)
  })
  it('treats null/invalid as zero', () => {
    expect(balanceRawToUsd(null)).toBe(0)
    expect(balanceRawToUsd(undefined)).toBe(0)
    expect(balanceRawToUsd('nope')).toBe(0)
  })
})

describe('buildPaymentRequired', () => {
  beforeEach(() => {
    process.env.X402_RECEIVER_WALLET = '0x1111111111111111111111111111111111111111'
    delete process.env.X402_MIN_TOPUP_USD
  })
  it('encodes amount in USDC base units (6 decimals)', () => {
    const pr = buildPaymentRequired(10)
    expect(pr.x402Version).toBe(2)
    expect(pr.accepts[0].amount).toBe('10000000')
    expect(pr.accepts[0].network).toBe('eip155:8453')
    expect(pr.accepts[0].payTo).toBe('0x1111111111111111111111111111111111111111')
  })
  it('floors the amount at the minimum top-up', () => {
    const pr = buildPaymentRequired(1)
    expect(pr.accepts[0].amount).toBe('5000000') // min $5
  })
})

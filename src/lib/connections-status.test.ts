import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VENICE_FRONTED_SENTINEL } from './venice-config'

const configFlags = vi.hoisted(() => ({
  disableFree: false,
  enabled: true,
}))

vi.mock('./x402/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./x402/config')>()
  return {
    ...actual,
    get X402_ENABLED() {
      return configFlags.enabled
    },
    get X402_DISABLE_FREE() {
      return configFlags.enabled && configFlags.disableFree
    },
  }
})

import { getConnectionsStatus } from './connections-status'
import { useAuthStore } from '../stores/auth-store'
import { useX402Store } from '../stores/x402-store'
import { useXSelfStore } from '../stores/x-self-store'

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

function resetAuth(apiKey: string | null = VENICE_FRONTED_SENTINEL, hasEncrypted = false) {
  useAuthStore.setState({ apiKey, hasEncrypted })
}

function resetXSelf(partial: Partial<ReturnType<typeof useXSelfStore.getState>> = {}) {
  useXSelfStore.setState({
    connected: false,
    connecting: false,
    ...partial,
  })
}

const BYOK_KEY = 'sk-user-byok-key'
const WALLET = '0xabc123'

function paidReady() {
  resetX402({
    address: WALLET,
    status: 'connected',
    sessionToken: 'sess',
    sessionExpiresAt: Date.now() + 60_000,
  })
}

function walletNeedsSiwe() {
  resetX402({
    address: WALLET,
    status: 'connected',
    sessionToken: null,
    sessionExpiresAt: null,
  })
}

describe('getConnectionsStatus', () => {
  beforeEach(() => {
    configFlags.enabled = true
    configFlags.disableFree = false
    resetX402()
    resetAuth()
    resetXSelf()
  })

  describe('Free on', () => {
    it('pill ok with app fronted key; compute ok (same job as Credits/BYOK)', () => {
      resetAuth(VENICE_FRONTED_SENTINEL)
      const s = getConnectionsStatus('intel')
      expect(s.tone).toBe('ok')
      expect(s.compute).toBe('ok')
      expect(s.x).toBe('amber')
    })

    it('compute ok when BYOK unlocked', () => {
      resetAuth(BYOK_KEY)
      const s = getConnectionsStatus('intel')
      expect(s.tone).toBe('ok')
      expect(s.compute).toBe('ok')
    })

    it('compute amber when encrypted key locked and Free has no live key', () => {
      resetAuth(null, true)
      const s = getConnectionsStatus('intel')
      expect(s.compute).toBe('amber')
      expect(s.tone).toBe('amber')
    })
  })

  describe('Free off — nothing connected', () => {
    it('pill off; compute off; X amber (never red)', () => {
      configFlags.disableFree = true
      resetAuth(VENICE_FRONTED_SENTINEL)
      const s = getConnectionsStatus('intel')
      expect(s.tone).toBe('off')
      expect(s.compute).toBe('off')
      expect(s.x).toBe('amber')
      expect(s.ariaLabel).toContain('not ready')
    })
  })

  describe('Free off — Credits', () => {
    it('wallet + SIWE → pill ok, compute ok (Credits covers Venice)', () => {
      configFlags.disableFree = true
      resetAuth(VENICE_FRONTED_SENTINEL)
      paidReady()
      const s = getConnectionsStatus('intel')
      expect(s.tone).toBe('ok')
      expect(s.compute).toBe('ok')
    })

    it('Credits + X connected → both dots ok (matches modal)', () => {
      configFlags.disableFree = true
      resetAuth(VENICE_FRONTED_SENTINEL)
      paidReady()
      resetXSelf({ connected: true })
      const s = getConnectionsStatus('intel')
      expect(s.tone).toBe('ok')
      expect(s.compute).toBe('ok')
      expect(s.x).toBe('ok')
    })

    it('wallet without SIWE → pill amber, compute amber', () => {
      configFlags.disableFree = true
      resetAuth(VENICE_FRONTED_SENTINEL)
      walletNeedsSiwe()
      const s = getConnectionsStatus('intel')
      expect(s.tone).toBe('amber')
      expect(s.compute).toBe('amber')
    })
  })

  describe('Free off — BYOK', () => {
    it('Venice + X BYOK, no wallet → pill ok; compute ok', () => {
      configFlags.disableFree = true
      resetAuth(BYOK_KEY)
      resetXSelf({ connected: true })
      const s = getConnectionsStatus('intel')
      expect(s.tone).toBe('ok')
      expect(s.compute).toBe('ok')
      expect(s.x).toBe('ok')
    })

    it('Venice only on Intel → pill amber; compute ok; X amber', () => {
      configFlags.disableFree = true
      resetAuth(BYOK_KEY)
      const s = getConnectionsStatus('intel')
      expect(s.tone).toBe('amber')
      expect(s.compute).toBe('ok')
      expect(s.x).toBe('amber')
    })

    it('Venice only on media tab → pill ok', () => {
      configFlags.disableFree = true
      resetAuth(BYOK_KEY)
      const s = getConnectionsStatus('image')
      expect(s.tone).toBe('ok')
      expect(s.compute).toBe('ok')
    })
  })
})

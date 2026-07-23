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
    it('ok with app fronted key', () => {
      resetAuth(VENICE_FRONTED_SENTINEL)
      expect(getConnectionsStatus('intel').tone).toBe('ok')
    })

    it('ok with Venice BYOK', () => {
      resetAuth(BYOK_KEY)
      expect(getConnectionsStatus('intel').tone).toBe('ok')
    })

    it('amber when encrypted key locked and no live key', () => {
      resetAuth(null, true)
      expect(getConnectionsStatus('intel').tone).toBe('amber')
    })
  })

  describe('Free off', () => {
    it('off when nothing connected', () => {
      configFlags.disableFree = true
      resetAuth(VENICE_FRONTED_SENTINEL)
      const s = getConnectionsStatus('intel')
      expect(s.tone).toBe('off')
      expect(s.ariaLabel).toBe('Connections: not ready')
    })

    it('ok when wallet + SIWE', () => {
      configFlags.disableFree = true
      resetAuth(VENICE_FRONTED_SENTINEL)
      paidReady()
      expect(getConnectionsStatus('intel').tone).toBe('ok')
    })

    it('amber when wallet needs SIWE', () => {
      configFlags.disableFree = true
      resetAuth(VENICE_FRONTED_SENTINEL)
      walletNeedsSiwe()
      expect(getConnectionsStatus('intel').tone).toBe('amber')
    })

    it('ok with full BYOK on Intel', () => {
      configFlags.disableFree = true
      resetAuth(BYOK_KEY)
      resetXSelf({ connected: true })
      expect(getConnectionsStatus('intel').tone).toBe('ok')
    })

    it('amber with Venice-only on Intel', () => {
      configFlags.disableFree = true
      resetAuth(BYOK_KEY)
      expect(getConnectionsStatus('intel').tone).toBe('amber')
    })

    it('ok with Venice-only on media tab', () => {
      configFlags.disableFree = true
      resetAuth(BYOK_KEY)
      expect(getConnectionsStatus('image').tone).toBe('ok')
    })

    it('amber with X-only on Intel', () => {
      configFlags.disableFree = true
      resetAuth(VENICE_FRONTED_SENTINEL)
      resetXSelf({ connected: true })
      expect(getConnectionsStatus('intel').tone).toBe('amber')
    })
  })
})

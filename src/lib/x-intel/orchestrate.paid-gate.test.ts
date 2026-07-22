/**
 * Integration: DISABLE_FREE must block Intel gather/report before any X/Venice
 * work when the credits wallet is disconnected (no Free shared-key path).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VENICE_FRONTED_SENTINEL } from '../venice-config'
import type { Profile } from './types'

const configFlags = vi.hoisted(() => ({ disableFree: true }))

vi.mock('../x402/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../x402/config')>()
  return {
    ...actual,
    X402_ENABLED: true,
    get X402_DISABLE_FREE() {
      return configFlags.disableFree
    },
  }
})

vi.mock('../x402/notify-paid-not-ready', () => ({
  notifyPaidNotReady: vi.fn(),
}))

const gatherProfile = vi.fn()
const gatherPosts = vi.fn()
const gatherMentions = vi.fn()
const synthesizeReport = vi.fn()

vi.mock('./gather', () => ({
  gatherProfile: (...args: unknown[]) => gatherProfile(...args),
  gatherPosts: (...args: unknown[]) => gatherPosts(...args),
  gatherMentions: (...args: unknown[]) => gatherMentions(...args),
}))

vi.mock('./synthesize', () => ({
  synthesizeReport: (...args: unknown[]) => synthesizeReport(...args),
}))

vi.mock('./article-hydrate', () => ({
  hydrateReportArticles: vi.fn(async (r: unknown) => r),
}))

vi.mock('./shared-push', () => ({
  pushShared: vi.fn(),
}))

import { runGather, generateReport } from './orchestrate'
import { PaidNotReadyError } from '../x402/charge-flow'
import { useX402Store } from '../../stores/x402-store'
import { useAuthStore } from '../../stores/auth-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { useXIntelStore } from '../../stores/x-intel-store'

const aliceProfile = {
  id: '1',
  username: 'alice',
  name: 'Alice',
  bio: '',
  avatarUrl: '',
  metrics: { followers: 0, following: 0, posts: 0, listed: 0, likes: 0, media: 0 },
} as Profile

function resetPaidOff() {
  useX402Store.setState({
    address: null,
    status: 'idle',
    sessionToken: null,
    sessionExpiresAt: null,
    balanceUsd: 0,
  })
  useAuthStore.setState({ apiKey: VENICE_FRONTED_SENTINEL })
  useXSelfStore.setState({ connected: false })
}

describe('orchestrate paid gate (DISABLE_FREE)', () => {
  beforeEach(() => {
    configFlags.disableFree = true
    resetPaidOff()
    gatherProfile.mockReset()
    gatherPosts.mockReset()
    gatherMentions.mockReset()
    synthesizeReport.mockReset()
    useXIntelStore.setState({
      targets: ['alice'],
      activeTarget: 'alice',
      reports: {
        alice: {
          username: 'alice',
          profile: aliceProfile,
          posts: [],
          edges: [],
          reports: [],
          cost: 0,
          gathering: false,
        },
      },
      gatheringTargets: {},
    } as never)
  })

  it('runGather throws PaidNotReadyError and never calls X gather', async () => {
    await expect(runGather('alice')).rejects.toBeInstanceOf(PaidNotReadyError)
    expect(gatherProfile).not.toHaveBeenCalled()
    expect(gatherPosts).not.toHaveBeenCalled()
    expect(gatherMentions).not.toHaveBeenCalled()
  })

  it('generateReport throws PaidNotReadyError and never synthesizes', async () => {
    await expect(generateReport('alice')).rejects.toBeInstanceOf(PaidNotReadyError)
    expect(synthesizeReport).not.toHaveBeenCalled()
  })

  it('allows gather when DISABLE_FREE is off (Free path)', async () => {
    configFlags.disableFree = false
    gatherProfile.mockResolvedValue({
      data: aliceProfile,
      cost: 0.01,
      units: 1,
      kind: 'users',
    })
    gatherPosts.mockResolvedValue({ data: [], cost: 0, units: 0, kind: 'posts' })
    gatherMentions.mockResolvedValue({ data: [], cost: 0, units: 0, kind: 'posts' })

    await expect(runGather('alice')).resolves.toBeUndefined()
    expect(gatherProfile).toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { useAlphaStore } from './alpha-store'
import { ALPHA_MAX_RAILS, buildDefaultSystemRails } from '../lib/alpha/default-rails'

describe('useAlphaStore', () => {
  beforeEach(() => {
    useAlphaStore.setState({
      systemRails: buildDefaultSystemRails(),
      userRails: [],
      countsByRail: {},
      expandedRailId: null,
      sessionCost: 0,
      lifetimeCost: 0,
    })
  })

  it('ships system rails by default', () => {
    const rails = useAlphaStore.getState().allRails()
    expect(rails.length).toBeGreaterThanOrEqual(2)
    expect(rails.every((r) => r.source === 'system' || r.source === 'user')).toBe(true)
  })

  it('adds and removes user rails', () => {
    const id = useAlphaStore.getState().addUserRail('Test', '$VVV -is:retweet')
    expect(id).toBeTruthy()
    expect(useAlphaStore.getState().userRails).toHaveLength(1)
    useAlphaStore.getState().removeUserRail(id!)
    expect(useAlphaStore.getState().userRails).toHaveLength(0)
  })

  it('enforces soft rail cap', () => {
    const s = useAlphaStore.getState()
    const room = ALPHA_MAX_RAILS - s.systemRails.length
    for (let i = 0; i < room; i++) {
      expect(s.addUserRail(`R${i}`, `q${i}`)).toBeTruthy()
    }
    expect(useAlphaStore.getState().addUserRail('overflow', 'x')).toBeNull()
  })

  it('accumulates cost', () => {
    useAlphaStore.getState().addCost(0.005)
    useAlphaStore.getState().addCost(0.01)
    expect(useAlphaStore.getState().sessionCost).toBeCloseTo(0.015)
    expect(useAlphaStore.getState().lifetimeCost).toBeCloseTo(0.015)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { useAlphaStore } from './alpha-store'
import { ALPHA_MAX_RAILS, buildDefaultSystemRails } from '../lib/alpha/default-rails'

describe('useAlphaStore', () => {
  beforeEach(() => {
    useAlphaStore.setState({
      systemRails: buildDefaultSystemRails(),
      userRails: [],
      countsByRail: {},
      newsScan: null,
      expandedRailId: null,
      sessionCost: 0,
      lifetimeCost: 0,
      briefs: {},
      stories: {},
      posts: {},
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

  it('keeps briefs and prunes unpinned after 24h', () => {
    const now = Date.now()
    useAlphaStore.getState().keepBrief({
      id: 'b-old',
      kind: 'global',
      markdown: 'old',
      model: 'm',
      fetchedAt: now - 25 * 60 * 60 * 1000,
      pinned: false,
    })
    useAlphaStore.getState().keepBrief({
      id: 'b-pin',
      kind: 'global',
      markdown: 'pin',
      model: 'm',
      fetchedAt: now - 25 * 60 * 60 * 1000,
      pinned: true,
    })
    useAlphaStore.getState().pruneCold()
    const { briefs } = useAlphaStore.getState()
    expect(briefs['b-old']).toBeUndefined()
    expect(briefs['b-pin']).toBeTruthy()
  })

  it('toggles pin on a story', () => {
    useAlphaStore.getState().keepStory({
      id: 's1',
      name: 'Story',
      clusterPostIds: [],
      fetchedAt: Date.now(),
      pinned: false,
    })
    useAlphaStore.getState().setColdPinned('story', 's1', true)
    expect(useAlphaStore.getState().stories['s1']?.pinned).toBe(true)
  })

  it('persists news scan cache', () => {
    useAlphaStore.getState().setNewsScan({
      stories: [
        {
          id: 'n1',
          name: 'Breaking',
          clusterPostIds: [],
        },
      ],
      fetchedAt: 123,
    })
    expect(useAlphaStore.getState().newsScan?.stories[0]?.name).toBe('Breaking')
    expect(useAlphaStore.getState().newsScan?.fetchedAt).toBe(123)
  })
})

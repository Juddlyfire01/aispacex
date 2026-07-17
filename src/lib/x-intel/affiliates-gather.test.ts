import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { XPaginatedResponse, XUserRaw } from './types'

// Mock the network layer so gatherAffiliates is exercised offline.
const xapiMock = vi.fn()
vi.mock('./x-client', () => ({
  xapi: (...args: unknown[]) => xapiMock(...args),
}))

import { gatherAffiliates } from './gather'

function member(id: string, username: string, followers: number): XUserRaw {
  return {
    id,
    name: username,
    username,
    verified_type: 'blue',
    affiliation: {
      badge_url: 'https://pbs.twimg.com/badge.png',
      description: 'Venice',
      user_id: ['1764736490515685376'],
    },
    public_metrics: { followers_count: followers, following_count: 0, tweet_count: 0, listed_count: 0 },
  }
}

beforeEach(() => {
  xapiMock.mockReset()
})

describe('gatherAffiliates', () => {
  it('returns all affiliates from a single page, normalized with affiliation', async () => {
    const page: XPaginatedResponse<XUserRaw> = {
      data: [member('1', 'erik', 900000), member('2', 'jesse', 9000)],
      meta: { result_count: 2 },
    }
    xapiMock.mockResolvedValueOnce(page)

    const { data, cost } = await gatherAffiliates('org1', 'demo')

    expect(data).toHaveLength(2)
    expect(data[0].username).toBe('erik')
    expect(data[0].affiliation?.description).toBe('Venice')
    expect(data[0].affiliation?.badgeUrl).toBe('https://pbs.twimg.com/badge.png')
    // No includes.users on this page → parent org cannot be resolved (stays null).
    expect(data[0].affiliation?.org).toBeNull()
    expect(cost).toBeCloseTo(0.02) // 2 users × $0.01
    expect(xapiMock).toHaveBeenCalledTimes(1)
  })

  it('follows pagination until next_token is exhausted', async () => {
    xapiMock
      .mockResolvedValueOnce({ data: [member('1', 'a', 1)], meta: { result_count: 1, next_token: 'p2' } })
      .mockResolvedValueOnce({ data: [member('2', 'b', 2)], meta: { result_count: 1, next_token: 'p3' } })
      .mockResolvedValueOnce({ data: [member('3', 'c', 3)], meta: { result_count: 1 } })

    const { data } = await gatherAffiliates('org1', 'demo')

    expect(data.map((m) => m.username)).toEqual(['a', 'b', 'c'])
    expect(xapiMock).toHaveBeenCalledTimes(3)
    // The pagination_token from each page feeds the next request.
    expect(xapiMock.mock.calls[1][1]).toMatchObject({ pagination_token: 'p2' })
    expect(xapiMock.mock.calls[2][1]).toMatchObject({ pagination_token: 'p3' })
  })

  it('resolves the parent org from includes when present', async () => {
    xapiMock.mockResolvedValueOnce({
      data: [member('1', 'erik', 1)],
      includes: { users: [{ id: '1764736490515685376', name: 'Venice', username: 'AskVenice' }] },
      meta: { result_count: 1 },
    })
    const { data } = await gatherAffiliates('org1', 'demo')
    expect(data[0].affiliation?.org?.username).toBe('AskVenice')
  })

  it('throws when the API returns only errors', async () => {
    xapiMock.mockResolvedValueOnce({ errors: [{ title: 'Forbidden', detail: 'client-not-enrolled' }] })
    await expect(gatherAffiliates('org1', 'oauth')).rejects.toThrow('client-not-enrolled')
  })

  it('returns an empty roster with zero cost when there are no affiliates', async () => {
    xapiMock.mockResolvedValueOnce({ data: [], meta: { result_count: 0 } })
    const { data, cost } = await gatherAffiliates('org1', 'demo')
    expect(data).toEqual([])
    expect(cost).toBe(0)
  })
})

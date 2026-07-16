import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPostsByIds } from './x-alpha-client'

describe('fetchPostsByIds', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: '1',
                text: 'hello',
                author_id: 'u1',
                public_metrics: { like_count: 3 },
              },
            ],
            includes: { users: [{ id: 'u1', username: 'alice' }] },
          }),
          { status: 200 },
        ),
      ),
    )
  })

  it('returns AlphaPostCards and costs by post count', async () => {
    const { posts, cost } = await fetchPostsByIds(['1'])
    expect(posts[0]?.authorUsername).toBe('alice')
    expect(posts[0]?.text).toBe('hello')
    expect(cost).toBeGreaterThan(0)
  })

  it('no-ops on empty ids', async () => {
    const res = await fetchPostsByIds([])
    expect(res.posts).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})

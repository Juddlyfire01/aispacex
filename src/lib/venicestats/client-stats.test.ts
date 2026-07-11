import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchStatsAction } from './client'

describe('fetchStatsAction', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ vvvPrice: 10, marketCap: 1, fdv: 2, totalStaked: 9 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('projects price from metrics', async () => {
    const out = await fetchStatsAction('protocol', 'price', {})
    expect(out).toMatchObject({ vvvPrice: 10, marketCap: 1 })
    expect(out).not.toHaveProperty('totalStaked')
  })

  it('returns unsupported for benchmarks', async () => {
    const out = await fetchStatsAction('market', 'benchmarks', {})
    expect(out).toMatchObject({ error: expect.any(String), unsupported: true, action: 'benchmarks' })
  })
})

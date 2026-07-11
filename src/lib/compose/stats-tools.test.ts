import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { COMPOSE_STATS_TOOLS, executeStatsTool } from './stats-tools'

describe('COMPOSE_STATS_TOOLS', () => {
  it('defines four domain tools', () => {
    expect(COMPOSE_STATS_TOOLS.map((t) => t.function.name)).toEqual([
      'stats_protocol',
      'stats_market',
      'stats_social',
      'stats_wallet',
    ])
    for (const t of COMPOSE_STATS_TOOLS) {
      expect(t.function.parameters.required).toContain('action')
      expect(t.function.parameters.additionalProperties).toBe(false)
    }
  })
})

describe('executeStatsTool', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes('/api/metrics')) {
          return new Response(JSON.stringify({ vvvPrice: 10, marketCap: 1, fdv: 2 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'missing mock' }), { status: 404 })
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('runs stats_protocol price', async () => {
    const result = await executeStatsTool('stats_protocol', { action: 'price' })
    expect(result).toMatchObject({ vvvPrice: 10 })
  })

  it('unknown tool name errors', async () => {
    const result = await executeStatsTool('stats_nope', { action: 'price' })
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('missing action errors', async () => {
    const result = await executeStatsTool('stats_social', {})
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('requires address for wallet', async () => {
    const result = await executeStatsTool('stats_wallet', { action: 'wallet' })
    expect(result).toEqual({ error: expect.stringMatching(/address/i) })
  })
})

import { describe, it, expect } from 'vitest'
import {
  buildStatsRequest,
  projectMetrics,
  downsampleChartSeries,
  type StatsDomain,
} from './paths'

describe('buildStatsRequest', () => {
  it('maps burns to /api/burns with limit', () => {
    expect(buildStatsRequest('protocol', 'burns', { limit: 5 })).toEqual({
      kind: 'venicestats',
      path: '/api/burns',
      params: { limit: '5' },
    })
  })

  it('maps wallet to venetians address', () => {
    const addr = '0xd02eef6cff9cf07d1af73bc2a6edb5ab36a0869d'
    expect(buildStatsRequest('wallet', 'wallet', { address: addr })).toEqual({
      kind: 'venicestats',
      path: '/api/venetians',
      params: { address: addr },
    })
  })

  it('maps models to venice models', () => {
    expect(buildStatsRequest('protocol', 'models', {})).toEqual({
      kind: 'venice_models',
      type: 'text',
    })
  })

  it('marks benchmarks unsupported', () => {
    expect(buildStatsRequest('market', 'benchmarks', {})).toEqual({
      kind: 'unsupported',
      action: 'benchmarks',
    })
  })

  it('rejects unknown action', () => {
    expect(() => buildStatsRequest('social', 'nope' as never, {})).toThrow(/unknown/i)
  })
})

describe('projectMetrics', () => {
  const sample = {
    vvvPrice: 10,
    marketCap: 1,
    fdv: 2,
    totalStaked: 3,
    stakingRatio: 0.5,
    stakerApr: 8,
    freeFloatVvv: 4,
    diemPrice: 1000,
  }

  it('projects price fields', () => {
    const out = projectMetrics(sample, 'price')
    expect(out).toMatchObject({ vvvPrice: 10, marketCap: 1, fdv: 2 })
    expect(out).not.toHaveProperty('totalStaked')
  })

  it('projects staking fields', () => {
    expect(projectMetrics(sample, 'staking')).toMatchObject({
      totalStaked: 3,
      stakingRatio: 0.5,
      stakerApr: 8,
    })
  })
})

describe('downsampleChartSeries', () => {
  it('caps points per series', () => {
    const charts = {
      period: '30d',
      vvvPrice: Array.from({ length: 500 }, (_, i) => ({ t: i, v: i })),
    }
    const out = downsampleChartSeries(charts, 50)
    expect((out.vvvPrice as unknown[]).length).toBeLessThanOrEqual(50)
    expect(out.downsampled).toBe(true)
  })
})

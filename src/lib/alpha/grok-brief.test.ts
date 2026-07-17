import { describe, expect, it } from 'vitest'
import {
  buildAlphaGrokPrompt,
  pickAlphaGrokModel,
  railHeatScore,
} from './grok-brief'
import type { VeniceModel } from '../../types/venice'
import type { AlphaRail, RailCountsCache } from './types'

function model(id: string, xSearch: boolean): VeniceModel {
  return {
    id,
    object: 'model',
    created: 0,
    owned_by: 'venice',
    model_spec: {
      name: id,
      capabilities: { supportsXSearch: xSearch },
    },
  }
}

describe('pickAlphaGrokModel', () => {
  it('returns null when nothing supports X search', () => {
    expect(pickAlphaGrokModel([model('llama-3', false)])).toBeNull()
  })

  it('prefers Grok with X search over non-Grok', () => {
    const id = pickAlphaGrokModel([
      model('some-x-search', true),
      model('grok-4', true),
      model('grok-3', true),
    ])
    expect(id).toBe('grok-4')
  })
})

describe('buildAlphaGrokPrompt', () => {
  it('includes rail labels and velocity when counts exist', () => {
    const rails: AlphaRail[] = [
      {
        id: 'sys-sphere',
        label: 'Venice sphere',
        query: 'VeniceAI -is:retweet',
        source: 'system',
        enabled: true,
      },
    ]
    const now = Date.now()
    const counts: Record<string, RailCountsCache> = {
      'sys-sphere': {
        railId: 'sys-sphere',
        query: 'VeniceAI -is:retweet',
        fetchedAt: now,
        totalTweetCount: 1200,
        buckets: [
          { start: '2026-07-14T00:00:00Z', end: '2026-07-14T01:00:00Z', tweet_count: 10 },
          { start: '2026-07-14T01:00:00Z', end: '2026-07-14T02:00:00Z', tweet_count: 25 },
        ],
        cost: 0.005,
      },
    }
    const prompt = buildAlphaGrokPrompt(rails, counts)
    expect(prompt).toContain('Venice sphere')
    expect(prompt).toContain('VeniceAI -is:retweet')
    expect(prompt).toContain('Accelerating now')
    expect(prompt).toContain('+150%')
    expect(prompt).toContain('X-native signal')
  })
})

describe('railHeatScore', () => {
  it('ranks higher hour velocity above lower', () => {
    const hot = railHeatScore(
      {
        hourPct: 80,
        dayPct: 10,
        lastHourCount: 50,
        priorHourCount: 28,
        lastDayCount: 100,
        priorDayCount: 90,
      },
      1000,
    )
    const cold = railHeatScore(
      {
        hourPct: -20,
        dayPct: 5,
        lastHourCount: 5,
        priorHourCount: 6,
        lastDayCount: 80,
        priorDayCount: 76,
      },
      5000,
    )
    expect(hot).toBeGreaterThan(cold)
  })
})

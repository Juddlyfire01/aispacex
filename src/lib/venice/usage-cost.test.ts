import { describe, it, expect } from 'vitest'
import { estimateUsageUsd, estimateMediaUsd } from './usage-cost'
import type { VeniceModel } from '../../types/venice'

function mediaModel(pricing: NonNullable<VeniceModel['model_spec']>['pricing']): VeniceModel {
  return { id: 'media', object: 'model', created: 0, owned_by: 'venice', model_spec: { pricing } }
}

function model(inputUsd?: number, outputUsd?: number): VeniceModel {
  return {
    id: 'test',
    object: 'model',
    created: 0,
    owned_by: 'venice',
    model_spec: {
      pricing: {
        input: inputUsd != null ? { usd: inputUsd } : undefined,
        output: outputUsd != null ? { usd: outputUsd } : undefined,
      },
    },
  }
}

describe('estimateUsageUsd', () => {
  it('prices prompt and completion per 1M tokens', () => {
    // 1M prompt @ $1 + 1M completion @ $2 = $3
    expect(
      estimateUsageUsd(model(1, 2), { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }),
    ).toBeCloseTo(3)
  })

  it('handles fractional usage', () => {
    // 500 prompt @ $2/M = $0.001; 250 completion @ $4/M = $0.001
    expect(
      estimateUsageUsd(model(2, 4), { prompt_tokens: 500, completion_tokens: 250 }),
    ).toBeCloseTo(0.002)
  })

  it('returns 0 when pricing or usage missing', () => {
    expect(estimateUsageUsd(undefined, { prompt_tokens: 100, completion_tokens: 50 })).toBe(0)
    expect(estimateUsageUsd(model(1, 2), null)).toBe(0)
    expect(estimateUsageUsd(model(), { prompt_tokens: 100, completion_tokens: 50 })).toBe(0)
  })

  it('falls back to total_tokens with input rate', () => {
    expect(estimateUsageUsd(model(1, 2), { total_tokens: 1_000_000 })).toBeCloseTo(1)
  })
})

describe('estimateMediaUsd', () => {
  it('prices image per generation x variants', () => {
    const m = mediaModel({ generation: { usd: 0.01 } })
    expect(estimateMediaUsd(m, 'image', { variants: 4 })).toBeCloseTo(0.04)
    expect(estimateMediaUsd(m, 'image')).toBeCloseTo(0.01)
  })

  it('prices video by duration bucket when present', () => {
    const m = mediaModel({
      durations: { '5': { usd: 0.25, diem: 0, min_seconds: 0, max_seconds: 5 } },
      per_second: { usd: 0.1 },
    })
    expect(estimateMediaUsd(m, 'video', { durationKey: '5' })).toBeCloseTo(0.25)
  })

  it('prices video per second when no bucket matches', () => {
    const m = mediaModel({ per_second: { usd: 0.1 } })
    expect(estimateMediaUsd(m, 'video', { seconds: 8 })).toBeCloseTo(0.8)
  })

  it('prices music per second', () => {
    const m = mediaModel({ per_second: { usd: 0.02 } })
    expect(estimateMediaUsd(m, 'music', { seconds: 30 })).toBeCloseTo(0.6)
  })

  it('prices tts per 1k characters', () => {
    const m = mediaModel({ per_thousand_characters: { usd: 0.015 } })
    expect(estimateMediaUsd(m, 'tts', { characters: 2000 })).toBeCloseTo(0.03)
  })

  it('returns 0 when pricing missing for the kind', () => {
    expect(estimateMediaUsd(mediaModel({}), 'image', { variants: 1 })).toBe(0)
    expect(estimateMediaUsd(undefined, 'tts', { characters: 1000 })).toBe(0)
  })
})

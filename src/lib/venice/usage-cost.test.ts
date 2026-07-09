import { describe, it, expect } from 'vitest'
import { estimateUsageUsd } from './usage-cost'
import type { VeniceModel } from '../../types/venice'

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

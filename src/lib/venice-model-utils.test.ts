import { describe, it, expect } from 'vitest'
import type { ModelTrait, VeniceModel } from '../types/venice'
import {
  filterModelsForPicker,
  resolveDefaultModelId,
  resolveMostUncensoredModelId,
} from './venice-model-utils'

const model = (id: string, traits: ModelTrait[] = []): VeniceModel => ({
  id,
  object: 'model',
  created: 0,
  owned_by: 'venice.ai',
  model_spec: { traits, offline: false },
})

describe('filterModelsForPicker', () => {
  it('drops bria-bg-remover from image picker lists', () => {
    const models = filterModelsForPicker('image', [
      model('bria-bg-remover'),
      model('z-image-turbo', ['default']),
    ])
    expect(models.map((m) => m.id)).toEqual(['z-image-turbo'])
  })

  it('does not filter non-image types', () => {
    const models = filterModelsForPicker('tts', [model('bria-bg-remover'), model('tts-kokoro')])
    expect(models.map((m) => m.id)).toEqual(['bria-bg-remover', 'tts-kokoro'])
  })
})

describe('resolveDefaultModelId', () => {
  const models = [model('bria-bg-remover'), model('z-image-turbo', ['default'])]

  it('prefers traits map default when model is in the list', () => {
    expect(resolveDefaultModelId(models, { default: 'z-image-turbo' }, 'image')).toBe('z-image-turbo')
  })

  it('falls back to per-model default trait', () => {
    expect(resolveDefaultModelId(models, {}, 'image')).toBe('z-image-turbo')
  })

  it('uses type fallback when no trait matches', () => {
    expect(resolveDefaultModelId([model('tts-qwen3-0-6b')], {}, 'tts')).toBe('tts-kokoro')
  })
})

describe('resolveMostUncensoredModelId', () => {
  it('prefers traits map most_uncensored', () => {
    const models = [
      model('venice-uncensored-1-1'),
      model('venice-uncensored-1-2', ['most_uncensored']),
    ]
    expect(
      resolveMostUncensoredModelId(models, { most_uncensored: 'venice-uncensored-1-2' }),
    ).toBe('venice-uncensored-1-2')
  })

  it('falls back to per-model most_uncensored trait', () => {
    const models = [
      model('other'),
      model('venice-uncensored-1-2', ['most_uncensored']),
    ]
    expect(resolveMostUncensoredModelId(models, {})).toBe('venice-uncensored-1-2')
  })
})

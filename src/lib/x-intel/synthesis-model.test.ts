import { describe, it, expect } from 'vitest'
import {
  pickSynthesisModel,
  shouldUpgradeSynthesisModel,
  resolveSynthesisModelForDisplay,
  LEGACY_SYNTHESIS_DEFAULT,
} from './synthesis-model'
import type { ModelTrait, VeniceModel } from '../../types/venice'

function model(
  id: string,
  opts?: { traits?: ModelTrait[]; created?: number },
): VeniceModel {
  return {
    id,
    object: 'model',
    created: opts?.created ?? 0,
    owned_by: 'venice',
    model_spec: { traits: opts?.traits },
  }
}

describe('pickSynthesisModel', () => {
  it('picks the highest-version standard grok', () => {
    const models = [
      model('grok-4-3', { traits: [] }),
      model('grok-4-20'),
      model('grok-4-20-multi-agent', { created: 99 }),
    ]
    expect(pickSynthesisModel(models)).toBe('grok-4-3')
  })

  it('falls back to venice uncensored default trait', () => {
    const models = [
      model('venice-uncensored-1-1'),
      model('venice-uncensored-1-2', { traits: ['default'] }),
      model('zai-org-glm-4.7'),
    ]
    expect(pickSynthesisModel(models)).toBe('venice-uncensored-1-2')
  })

  it('falls back to highest venice-uncensored id when no default trait', () => {
    const models = [
      model('venice-uncensored-1-1'),
      model('venice-uncensored-1-2'),
      model('plain-z'),
    ]
    expect(pickSynthesisModel(models)).toBe('venice-uncensored-1-2')
  })

  it('falls back to alphabetical when no grok or uncensored', () => {
    const models = [model('z-model'), model('a-model')]
    expect(pickSynthesisModel(models)).toBe('a-model')
  })
})

describe('shouldUpgradeSynthesisModel', () => {
  const models = [model('grok-4-3'), model(LEGACY_SYNTHESIS_DEFAULT)]

  it('upgrades empty and legacy default', () => {
    expect(shouldUpgradeSynthesisModel('', models)).toBe(true)
    expect(shouldUpgradeSynthesisModel(LEGACY_SYNTHESIS_DEFAULT, models)).toBe(true)
  })

  it('upgrades missing catalog ids', () => {
    expect(shouldUpgradeSynthesisModel('removed-model', models)).toBe(true)
  })

  it('keeps valid user selections', () => {
    expect(shouldUpgradeSynthesisModel('grok-4-3', models)).toBe(false)
  })
})

describe('resolveSynthesisModelForDisplay', () => {
  const models = [model('grok-4-3'), model(LEGACY_SYNTHESIS_DEFAULT)]

  it('hides empty/legacy while catalog is loading', () => {
    expect(resolveSynthesisModelForDisplay('', undefined)).toBe('')
    expect(resolveSynthesisModelForDisplay(LEGACY_SYNTHESIS_DEFAULT, undefined)).toBe('')
    expect(resolveSynthesisModelForDisplay(LEGACY_SYNTHESIS_DEFAULT, [])).toBe('')
  })

  it('keeps a real user pick while catalog is loading', () => {
    expect(resolveSynthesisModelForDisplay('grok-4-3', undefined)).toBe('grok-4-3')
  })

  it('shows the live default immediately when stored value should upgrade', () => {
    expect(resolveSynthesisModelForDisplay('', models)).toBe('grok-4-3')
    expect(resolveSynthesisModelForDisplay(LEGACY_SYNTHESIS_DEFAULT, models)).toBe('grok-4-3')
  })

  it('keeps a valid stored selection once catalog is loaded', () => {
    expect(resolveSynthesisModelForDisplay('grok-4-3', models)).toBe('grok-4-3')
  })
})

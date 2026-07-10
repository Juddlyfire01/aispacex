import { describe, it, expect } from 'vitest'
import {
  pickComposeModel,
  modelSupportsXSearch,
  modelIdSupportsFunctionCalling,
  filterComposeToolModels,
  COMPOSE_FALLBACK_MODEL,
} from './model'
import type { VeniceModel } from '../../types/venice'

function model(
  id: string,
  opts?: {
    xSearch?: boolean
    tools?: boolean
    created?: number
    traits?: string[]
  },
): VeniceModel {
  return {
    id,
    object: 'model',
    created: opts?.created ?? 0,
    owned_by: 'venice',
    model_spec: {
      capabilities: {
        supportsXSearch: opts?.xSearch,
        supportsFunctionCalling: opts?.tools ?? true,
      },
      traits: opts?.traits,
    },
  }
}

describe('filterComposeToolModels', () => {
  it('keeps only supportsFunctionCalling models', () => {
    const models = [
      model('with-tools', { tools: true }),
      model('gemma-no-tools', { tools: false }),
      model('also-tools', { tools: true }),
    ]
    expect(filterComposeToolModels(models).map((m) => m.id)).toEqual(['with-tools', 'also-tools'])
  })
})

describe('pickComposeModel', () => {
  it('picks the highest-version grok with x search', () => {
    const models = [
      model('grok-4-3', { xSearch: true, created: 2 }),
      model('grok-4-20', { xSearch: true, created: 1 }),
      model('grok-4-20-multi-agent', { xSearch: true, created: 3 }),
    ]
    expect(pickComposeModel(models)).toBe('grok-4-3')
  })

  it('prefers base grok over same-version variants', () => {
    const models = [
      model('grok-4-20-multi-agent', { xSearch: true }),
      model('grok-4-20', { xSearch: true }),
    ]
    expect(pickComposeModel(models)).toBe('grok-4-20')
  })

  it('walks down groks when the highest lacks x search', () => {
    const models = [
      model('grok-4-20', { xSearch: false }),
      model('grok-4-3', { xSearch: true }),
    ]
    expect(pickComposeModel(models)).toBe('grok-4-3')
  })

  it('falls back to any x-search model when no grok supports it', () => {
    const models = [model('grok-4-20', { xSearch: false }), model('search-model', { xSearch: true })]
    expect(pickComposeModel(models)).toBe('search-model')
  })

  it('falls back to venice-uncensored-1-2 when nothing supports x search', () => {
    const models = [
      model('grok-4-20', { xSearch: false }),
      model(COMPOSE_FALLBACK_MODEL, { xSearch: false }),
    ]
    expect(pickComposeModel(models)).toBe(COMPOSE_FALLBACK_MODEL)
  })

  it('falls back to the default trait model before the first list entry', () => {
    const models = [
      model('plain-a', { xSearch: false }),
      model('zai-org-glm-4.7', { xSearch: false, traits: ['default'] }),
    ]
    expect(pickComposeModel(models)).toBe('zai-org-glm-4.7')
  })

  it('ignores non-tool models even if they have x search', () => {
    const models = [
      model('gemma-x', { xSearch: true, tools: false }),
      model('grok-4-3', { xSearch: true, tools: true }),
    ]
    expect(pickComposeModel(models)).toBe('grok-4-3')
  })

  it('returns fallback id when no tool models exist', () => {
    const models = [model('gemma', { tools: false, xSearch: true })]
    expect(pickComposeModel(models)).toBe(COMPOSE_FALLBACK_MODEL)
  })
})

describe('modelSupportsXSearch', () => {
  it('reflects the capability flag for a given id', () => {
    const models = [model('grok-4-20', { xSearch: true }), model('plain', { xSearch: false })]
    expect(modelSupportsXSearch(models, 'grok-4-20')).toBe(true)
    expect(modelSupportsXSearch(models, 'plain')).toBe(false)
    expect(modelSupportsXSearch(models, 'missing')).toBe(false)
  })
})

describe('modelIdSupportsFunctionCalling', () => {
  it('reflects the capability flag', () => {
    const models = [model('a', { tools: true }), model('b', { tools: false })]
    expect(modelIdSupportsFunctionCalling(models, 'a')).toBe(true)
    expect(modelIdSupportsFunctionCalling(models, 'b')).toBe(false)
    expect(modelIdSupportsFunctionCalling(models, 'missing')).toBe(false)
  })
})

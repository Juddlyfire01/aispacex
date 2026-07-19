import { describe, it, expect } from 'vitest'
import {
  pickComposeModel,
  modelSupportsXSearch,
  modelIdSupportsFunctionCalling,
  filterComposeToolModels,
  sortComposeResearchModels,
  shouldUpgradeComposeResearchModel,
  shouldUpgradeDraftModel,
  pickDefaultDraftModel,
  formatComposeResearchLabel,
  plainModelDisplayName,
  COMPOSE_FALLBACK_MODEL,
} from './model'
import type { ModelTrait, VeniceModel } from '../../types/venice'

function model(
  id: string,
  opts?: {
    xSearch?: boolean
    tools?: boolean
    created?: number
    traits?: ModelTrait[]
    name?: string
  },
): VeniceModel {
  return {
    id,
    object: 'model',
    created: opts?.created ?? 0,
    owned_by: 'venice',
    model_spec: {
      name: opts?.name,
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

describe('sortComposeResearchModels', () => {
  it('pins the preferred research default first', () => {
    const models = [
      model('zzz-tools', { name: 'Zed', xSearch: false }),
      model('grok-4-3', { name: 'Grok 4.3', xSearch: true }),
      model('aaa-tools', { name: 'Aaa', xSearch: false }),
    ]
    const sorted = sortComposeResearchModels(models, 'grok-4-3')
    expect(sorted.map((m) => m.id)[0]).toBe('grok-4-3')
  })
})

describe('shouldUpgradeComposeResearchModel', () => {
  it('upgrades empty / non-tool / missing', () => {
    const models = [model('grok-4-3', { xSearch: true }), model('plain', { xSearch: false })]
    expect(shouldUpgradeComposeResearchModel('', models)).toBe(true)
    expect(shouldUpgradeComposeResearchModel('gone', models)).toBe(true)
    expect(
      shouldUpgradeComposeResearchModel(
        'no-tools',
        [...models, model('no-tools', { tools: false, xSearch: true })],
      ),
    ).toBe(true)
  })

  it('follows previous default when a newer standard grok ships', () => {
    const models = [
      model('grok-4-3', { xSearch: true }),
      model('grok-5', { xSearch: true, name: 'Grok 5.0' }),
    ]
    expect(shouldUpgradeComposeResearchModel('grok-4-3', models)).toBe(true)
    expect(pickComposeModel(models)).toBe('grok-5')
  })

  it('does not upgrade an intentional older non-default pick', () => {
    const models = [
      model('grok-4-1', { xSearch: true, name: 'Grok 4.1' }),
      model('grok-4-3', { xSearch: true, name: 'Grok 4.3' }),
      model('grok-5', { xSearch: true, name: 'Grok 5.0' }),
    ]
    // Previous default would be grok-4-3, not grok-4-1
    expect(shouldUpgradeComposeResearchModel('grok-4-1', models)).toBe(false)
  })

  it('does not upgrade when already on preferred', () => {
    const models = [model('grok-4-3', { xSearch: true })]
    expect(shouldUpgradeComposeResearchModel('grok-4-3', models)).toBe(false)
  })
})

describe('shouldUpgradeDraftModel', () => {
  it('follows most_uncensored when a newer Venice Uncensored ships', () => {
    const models = [
      model('venice-uncensored-1-2'),
      model('venice-uncensored-1-3', { traits: ['most_uncensored'] }),
    ]
    expect(shouldUpgradeDraftModel('venice-uncensored-1-2', models, 'venice-uncensored-1-3')).toBe(
      true,
    )
    expect(pickDefaultDraftModel(models, 'venice-uncensored-1-3')).toBe('venice-uncensored-1-3')
  })

  it('upgrades mistaken catalog default seed', () => {
    const models = [
      model('zai-org-glm-4.7', { traits: ['default'] }),
      model('venice-uncensored-1-2', { traits: ['most_uncensored'] }),
    ]
    expect(
      shouldUpgradeDraftModel('zai-org-glm-4.7', models, 'venice-uncensored-1-2', 'zai-org-glm-4.7'),
    ).toBe(true)
  })

  it('does not upgrade empty or same-as-main', () => {
    const models = [model('venice-uncensored-1-2', { traits: ['most_uncensored'] })]
    expect(shouldUpgradeDraftModel('', models, 'venice-uncensored-1-2')).toBe(false)
    expect(shouldUpgradeDraftModel('same', models, 'venice-uncensored-1-2')).toBe(false)
  })

  it('does not upgrade a non-uncensored intentional pick', () => {
    const models = [
      model('writer-a'),
      model('venice-uncensored-1-2', { traits: ['most_uncensored'] }),
    ]
    expect(shouldUpgradeDraftModel('writer-a', models, 'venice-uncensored-1-2')).toBe(false)
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

describe('plainModelDisplayName', () => {
  it('maps mathematical alphanumeric symbols to ASCII', () => {
    // Bold math capitals G R O K → GROK (U+1D406 etc.)
    const fancy = '𝐆𝐫𝐨𝐤 Build'
    expect(plainModelDisplayName(fancy)).toBe('Grok Build')
  })

  it('leaves normal names unchanged', () => {
    expect(plainModelDisplayName('GPT-5.4 Mini')).toBe('GPT-5.4 Mini')
  })
})

describe('formatComposeResearchLabel', () => {
  it('uses plain name and pins default', () => {
    const m = model('grok-4-3', { name: 'Grok 4.3', tools: true })
    expect(formatComposeResearchLabel(m, 'grok-4-3')).toBe('Grok 4.3 · default')
    expect(formatComposeResearchLabel(m, 'other')).toBe('Grok 4.3')
  })
})

import { describe, it, expect } from 'vitest'
import {
  parseDecimalVersion,
  extractModelVersion,
  compareModelsByVersionDesc,
  pickNewestModel,
} from './model-version-utils'
import type { VeniceModel } from '../types/venice'

function model(
  id: string,
  opts?: { name?: string; created?: number; betaModel?: boolean },
): VeniceModel {
  return {
    id,
    object: 'model',
    created: opts?.created ?? 0,
    owned_by: 'venice',
    model_spec: {
      name: opts?.name,
      betaModel: opts?.betaModel,
    },
  }
}

describe('parseDecimalVersion', () => {
  it('treats 4.3 as newer than 4.20 (decimal, not integer tuple)', () => {
    expect(parseDecimalVersion('4.3')).toBeGreaterThan(parseDecimalVersion('4.20'))
  })

  it('treats 4.3 as newer than 4.299999999', () => {
    expect(parseDecimalVersion('4.3')).toBeGreaterThan(parseDecimalVersion('4.299999999'))
  })
})

describe('extractModelVersion', () => {
  it('reads dotted versions from display names', () => {
    expect(extractModelVersion(model('grok-4-3', { name: 'Grok 4.3' }))).toBe('4.3')
    expect(extractModelVersion(model('grok-4-20', { name: 'Grok 4.20' }))).toBe('4.20')
  })

  it('falls back to hyphenated id segments', () => {
    expect(extractModelVersion(model('venice-uncensored-1-2'))).toBe('1.2')
  })
})

describe('pickNewestModel', () => {
  it('picks grok 4.3 over grok 4.20 regardless of created timestamp', () => {
    const models = [
      model('grok-4-20', { name: 'Grok 4.20', created: 99 }),
      model('grok-4-3', { name: 'Grok 4.3', created: 1 }),
    ]
    expect(pickNewestModel(models)?.id).toBe('grok-4-3')
  })

  it('prefers base ids over same-version variants', () => {
    const models = [
      model('grok-4-20-multi-agent', { name: 'Grok 4.20 Multi-Agent' }),
      model('grok-4-20', { name: 'Grok 4.20' }),
    ]
    expect(pickNewestModel(models)?.id).toBe('grok-4-20')
  })

  it('ranks venice uncensored by decimal version', () => {
    const models = [
      model('venice-uncensored-1-1', { name: 'Venice Uncensored 1.1' }),
      model('venice-uncensored-1-2', { name: 'Venice Uncensored 1.2' }),
    ]
    expect(pickNewestModel(models)?.id).toBe('venice-uncensored-1-2')
  })

  it('falls back to created when no version is extractable', () => {
    const models = [
      model('plain-a', { created: 1 }),
      model('plain-b', { created: 5 }),
    ]
    expect(pickNewestModel(models)?.id).toBe('plain-b')
  })
})

describe('compareModelsByVersionDesc', () => {
  it('sorts highest decimal version first', () => {
    const models = [
      model('grok-4-20', { name: 'Grok 4.20' }),
      model('grok-4-3', { name: 'Grok 4.3' }),
      model('grok-build-0-1', { name: 'Grok Build 0.1', betaModel: true }),
    ]
    const sorted = [...models].sort(compareModelsByVersionDesc)
    expect(sorted.map((m) => m.id)).toEqual(['grok-4-3', 'grok-4-20', 'grok-build-0-1'])
  })
})

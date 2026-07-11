import { describe, it, expect } from 'vitest'
import { parseDraftWriteBrief, isDraftHandoffEnabled, DRAFT_MODEL_SAME } from './draft-writer-tool'
import { splitWriterSegments, buildWriterUser } from './draft-writer'
import { sortDraftWriterModels, pickDefaultDraftModel } from './model'
import type { VeniceModel } from '../../types/venice'

function model(id: string, opts?: { name?: string; traits?: string[] }): VeniceModel {
  return {
    id,
    object: 'model',
    created: 0,
    owned_by: 'venice',
    model_spec: {
      name: opts?.name,
      traits: opts?.traits,
      capabilities: {},
    },
  }
}

describe('parseDraftWriteBrief', () => {
  it('parses brief and reply target', () => {
    const b = parseDraftWriteBrief({
      brief: 'Write about VVV',
      longform: false,
      target: { kind: 'reply', toPostId: '1', toUsername: 'bob' },
      notes: 'under 280',
    })
    expect(b.brief).toBe('Write about VVV')
    expect(b.longform).toBe(false)
    expect(b.notes).toBe('under 280')
    expect(b.target).toEqual({ kind: 'reply', toPostId: '1', toUsername: 'bob' })
  })

  it('tolerates missing brief', () => {
    expect(parseDraftWriteBrief({}).brief).toBe('')
  })
})

describe('isDraftHandoffEnabled', () => {
  it('false for same / empty', () => {
    expect(isDraftHandoffEnabled(DRAFT_MODEL_SAME)).toBe(false)
    expect(isDraftHandoffEnabled('')).toBe(false)
    expect(isDraftHandoffEnabled(null)).toBe(false)
  })
  it('true for a model id', () => {
    expect(isDraftHandoffEnabled('venice-uncensored-1-2')).toBe(true)
  })
})

describe('splitWriterSegments', () => {
  it('splits on ---', () => {
    expect(splitWriterSegments('one\n---\ntwo')).toEqual(['one', 'two'])
  })
  it('single segment', () => {
    expect(splitWriterSegments('hello')).toEqual(['hello'])
  })
})

describe('buildWriterUser', () => {
  it('appends preferred format rules', () => {
    const u = buildWriterUser({
      brief: 'Cover VVV burns',
      preferredFormat: 'article',
    })
    expect(u).toMatch(/Preferred format: article/)
    expect(u).toMatch(/# Title/)
  })
})

describe('sortDraftWriterModels', () => {
  it('pins most_uncensored first', () => {
    const models = [
      model('zzz', { name: 'Zed' }),
      model('venice-uncensored-1-2', { name: 'Venice Uncensored 1.2', traits: ['most_uncensored'] }),
      model('aaa-default', { name: 'Default', traits: ['default'] }),
    ]
    const sorted = sortDraftWriterModels(models, 'venice-uncensored-1-2')
    expect(sorted.map((m) => m.id)[0]).toBe('venice-uncensored-1-2')
  })
})

describe('pickDefaultDraftModel', () => {
  it('uses mostUncensoredModelId when present', () => {
    const models = [model('a'), model('venice-uncensored-1-2')]
    expect(pickDefaultDraftModel(models, 'venice-uncensored-1-2')).toBe('venice-uncensored-1-2')
  })
})

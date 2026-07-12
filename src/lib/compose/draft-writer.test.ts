import { describe, it, expect } from 'vitest'
import {
  parseDraftWriteBrief,
  isDraftHandoffEnabled,
  isSeparateDraftModel,
  resolveDraftWriterModelId,
  describeDraftWriteLabels,
  DRAFT_MODEL_SAME,
} from './draft-writer-tool'
import { splitWriterSegments, buildWriterUser, buildWriterSystem, parseArticleFromWriterText } from './draft-writer'
import { sortDraftWriterModels, pickDefaultDraftModel } from './model'
import type { ModelTrait, VeniceModel } from '../../types/venice'

function model(id: string, opts?: { name?: string; traits?: ModelTrait[] }): VeniceModel {
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
  it('always enables the draft tool path', () => {
    expect(isDraftHandoffEnabled(DRAFT_MODEL_SAME)).toBe(true)
    expect(isDraftHandoffEnabled('')).toBe(true)
    expect(isDraftHandoffEnabled(null)).toBe(true)
    expect(isDraftHandoffEnabled('venice-uncensored-1-2')).toBe(true)
  })
})

describe('isSeparateDraftModel / resolveDraftWriterModelId', () => {
  it('treats same / empty as main model', () => {
    expect(isSeparateDraftModel(DRAFT_MODEL_SAME)).toBe(false)
    expect(isSeparateDraftModel('')).toBe(false)
    expect(isSeparateDraftModel(null)).toBe(false)
    expect(resolveDraftWriterModelId(DRAFT_MODEL_SAME, 'grok-main')).toBe('grok-main')
    expect(resolveDraftWriterModelId('', 'grok-main')).toBe('grok-main')
  })
  it('uses a distinct draft model id when set', () => {
    expect(isSeparateDraftModel('venice-uncensored-1-2')).toBe(true)
    expect(resolveDraftWriterModelId('venice-uncensored-1-2', 'grok-main')).toBe(
      'venice-uncensored-1-2',
    )
  })
})

describe('describeDraftWriteLabels', () => {
  it('uses Writing draft labels for same model', () => {
    expect(describeDraftWriteLabels({ sameModel: true, article: false })).toEqual({
      progressLabel: 'Writing draft…',
      label: 'Wrote draft',
    })
    expect(describeDraftWriteLabels({ sameModel: true, article: true })).toEqual({
      progressLabel: 'Writing article…',
      label: 'Wrote article',
    })
  })
  it('uses handoff labels for a separate writer model', () => {
    expect(describeDraftWriteLabels({ sameModel: false, article: false }).progressLabel).toMatch(
      /Handing off/,
    )
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

describe('parseArticleFromWriterText', () => {
  it('parses # Title and body', () => {
    expect(parseArticleFromWriterText('# Hello\n\nBody paragraph')).toEqual({
      title: 'Hello',
      bodyMarkdown: 'Body paragraph',
      imagePrompt: undefined,
    })
  })

  it('treats body-only text as bodyMarkdown', () => {
    expect(parseArticleFromWriterText('Just a body')).toEqual({
      title: '',
      bodyMarkdown: 'Just a body',
      imagePrompt: undefined,
    })
  })

  it('strips ---IMAGE_PROMPT--- out of the body (not stored on draft)', () => {
    expect(
      parseArticleFromWriterText(
        '# Title\n\nArticle body.\n\n---IMAGE_PROMPT---\nneon vault, cyan lattice',
      ),
    ).toEqual({
      title: 'Title',
      bodyMarkdown: 'Article body.',
      imagePrompt: 'neon vault, cyan lattice',
    })
  })

  it('strips Image Prompt: heading out of the body', () => {
    const parsed = parseArticleFromWriterText(
      '# Title\n\nBody text.\n\nImage Prompt (techno abstract style):\nAbstract neon vault',
    )
    expect(parsed.title).toBe('Title')
    expect(parsed.bodyMarkdown).toBe('Body text.')
    expect(parsed.imagePrompt).toMatch(/Abstract neon vault/)
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
    expect(u).toMatch(/no image prompts/i)
    expect(u).not.toMatch(/IMAGE_PROMPT/)
    expect(u).not.toMatch(/Long-form allowed/)
  })

  it('reminds writer to apply REGISTER when hasRegister', () => {
    const u = buildWriterUser({ brief: 'Cover VVV burns' }, true)
    expect(u).toMatch(/Apply the REGISTER voice/)
    expect(buildWriterUser({ brief: 'x' }, false)).not.toMatch(/REGISTER voice/)
  })
})

describe('buildWriterSystem', () => {
  it('adds register override when inject present', () => {
    const sys = buildWriterSystem('REGISTER — HARD STYLE CONSTRAINT\nDescription: terse')
    expect(sys).toMatch(/REGISTER — HARD STYLE CONSTRAINT/)
    expect(sys).toMatch(/REGISTER OVERRIDE/)
    expect(buildWriterSystem(null)).not.toMatch(/REGISTER OVERRIDE/)
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

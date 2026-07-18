import { describe, it, expect } from 'vitest'
import {
  parseDraftWriteBrief,
  isDraftHandoffEnabled,
  isSeparateDraftModel,
  resolveDraftWriteFormat,
  resolveDraftWriterModelId,
  describeDraftWriteLabels,
  DRAFT_MODEL_SAME,
} from './draft-writer-tool'
import {
  splitWriterSegments,
  buildWriterUser,
  buildWriterSystem,
  buildDraftStageSystem,
  buildDraftStageWriteNow,
  buildDraftStageMessages,
  parseArticleFromWriterText,
  isToolCallShapedDraft,
} from './draft-writer'
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
  it('parses intent and reply target', () => {
    const b = parseDraftWriteBrief({
      intent: '≤280',
      longform: false,
      target: { kind: 'reply', toPostId: '1', toUsername: 'bob' },
    })
    expect(b.intent).toBe('≤280')
    expect(b.longform).toBe(false)
    expect(b.target).toEqual({ kind: 'reply', toPostId: '1', toUsername: 'bob' })
  })

  it('maps legacy brief/notes to intent', () => {
    expect(parseDraftWriteBrief({ brief: 'Write about VVV' }).intent).toBe('Write about VVV')
    expect(parseDraftWriteBrief({ notes: 'under 280' }).intent).toBe('under 280')
  })

  it('parses format when valid', () => {
    expect(parseDraftWriteBrief({ format: 'article' }).format).toBe('article')
    expect(parseDraftWriteBrief({ format: 'thread' }).format).toBe('thread')
    expect(parseDraftWriteBrief({ format: 'nope' }).format).toBeUndefined()
  })

  it('allows empty metadata', () => {
    expect(parseDraftWriteBrief({})).toEqual({})
  })
})

describe('resolveDraftWriteFormat', () => {
  it('locked preference wins over tool format', () => {
    expect(resolveDraftWriteFormat('post', 'article')).toBe('post')
    expect(resolveDraftWriteFormat('article', 'post')).toBe('article')
  })

  it('under Auto honors tool format', () => {
    expect(resolveDraftWriteFormat('auto', 'article')).toBe('article')
    expect(resolveDraftWriteFormat('auto', 'thread')).toBe('thread')
    expect(resolveDraftWriteFormat('auto', 'longform')).toBe('longform')
  })

  it('under Auto falls back to longform flag then post', () => {
    expect(resolveDraftWriteFormat('auto', undefined, true)).toBe('longform')
    expect(resolveDraftWriteFormat('auto')).toBe('post')
    expect(resolveDraftWriteFormat(undefined)).toBe('post')
  })
})

describe('isDraftHandoffEnabled', () => {
  it('is always true — draft stage is always separate', () => {
    expect(isDraftHandoffEnabled(DRAFT_MODEL_SAME)).toBe(true)
    expect(isDraftHandoffEnabled('')).toBe(true)
    expect(isDraftHandoffEnabled(null)).toBe(true)
    expect(isDraftHandoffEnabled('venice-uncensored-1-2')).toBe(true)
  })
})

describe('isSeparateDraftModel / resolveDraftWriterModelId', () => {
  it('treats same / empty as main model id', () => {
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
  it('uses handoff labels for draft stage', () => {
    expect(describeDraftWriteLabels({ article: false })).toEqual({
      progressLabel: 'Handing off to draft writer',
      label: 'Handed off to draft writer',
    })
    expect(describeDraftWriteLabels({ article: true }).label).toMatch(/article writer/)
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

describe('buildDraftStageWriteNow / buildWriterUser', () => {
  it('appends preferred format rules', () => {
    const u = buildDraftStageWriteNow({
      preferredFormat: 'article',
    })
    expect(u).toMatch(/DRAFT STAGE/)
    expect(u).toMatch(/Format: article/)
    expect(u).toMatch(/# Title/)
    expect(u).not.toMatch(/IMAGE_PROMPT/)
  })

  it('includes optional intent', () => {
    const u = buildWriterUser({ intent: 'reply lever', preferredFormat: 'post' })
    expect(u).toMatch(/Intent: reply lever/)
  })
})

describe('buildDraftStageSystem / buildWriterSystem', () => {
  it('appends the register inject and writing policy', () => {
    const sys = buildDraftStageSystem('REGISTER — HARD STYLE CONSTRAINT\nDescription: terse')
    expect(sys).toMatch(/REGISTER — HARD STYLE CONSTRAINT/)
    expect(sys).toMatch(/scale length and paragraphing/)
    expect(sys).toMatch(/NO tools/)
    expect(sys).toMatch(/## CRAFT/)
    expect(sys).toMatch(/SPENT \/ PRIOR ART/)
    expect(buildWriterSystem(null)).toMatch(/draft stage/)
  })

  it('always injects CRAFT craft guidance', () => {
    const sys = buildDraftStageSystem(null)
    expect(sys).toMatch(/## CRAFT/)
    expect(sys).toMatch(/Specificity beats cleverness/)
    expect(sys).toMatch(/HOOK PATTERNS/)
    expect(sys).toMatch(/ANTI-PATTERNS/)
  })
})

describe('buildDraftStageMessages', () => {
  it('replaces research system and appends write-now', () => {
    const msgs = buildDraftStageMessages(
      [
        { role: 'system', content: 'research system' },
        { role: 'user', content: 'Craft a post' },
        { role: 'assistant', content: 'Facts about DIEM' },
        { role: 'tool', content: '{"ok":true}', tool_call_id: 't1' },
      ],
      { preferredFormat: 'post', intent: '≤280' },
      'REGISTER inject',
    )
    expect(msgs[0]?.role).toBe('system')
    expect(String(msgs[0]?.content)).toMatch(/draft stage/)
    expect(String(msgs[0]?.content)).toMatch(/REGISTER inject/)
    expect(msgs.some((m) => m.role === 'tool')).toBe(true)
    expect(msgs[msgs.length - 1]?.role).toBe('user')
    expect(String(msgs[msgs.length - 1]?.content)).toMatch(/DRAFT STAGE/)
    expect(msgs.every((m) => m.content !== 'research system')).toBe(true)
  })
})

describe('isToolCallShapedDraft', () => {
  it('detects compose_write_draft echo', () => {
    expect(
      isToolCallShapedDraft(
        'compose_write_draft({\n  "format": "post",\n  "voice": "dense"\n})',
      ),
    ).toBe(true)
  })

  it('detects planning JSON without prose', () => {
    expect(
      isToolCallShapedDraft(
        '{"format":"post","hook":"lead with number","must_include":"336"}',
      ),
    ).toBe(true)
  })

  it('allows normal post copy', () => {
    expect(
      isToolCallShapedDraft(
        '~336 DIEM left. Credits burns + owned GPU margins. Own the $1/day claim?',
      ),
    ).toBe(false)
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

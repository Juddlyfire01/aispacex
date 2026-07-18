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
import { splitWriterSegments, buildWriterUser, buildWriterSystem, parseArticleFromWriterText, packConversationForWriter, isToolCallShapedDraft } from './draft-writer'
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

  it('parses format when valid', () => {
    expect(parseDraftWriteBrief({ brief: 'x', format: 'article' }).format).toBe('article')
    expect(parseDraftWriteBrief({ brief: 'x', format: 'thread' }).format).toBe('thread')
    expect(parseDraftWriteBrief({ brief: 'x', format: 'nope' }).format).toBeUndefined()
  })

  it('tolerates missing brief', () => {
    expect(parseDraftWriteBrief({}).brief).toBe('')
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
  it('is enabled only for a distinct draft model', () => {
    expect(isDraftHandoffEnabled(DRAFT_MODEL_SAME)).toBe(false)
    expect(isDraftHandoffEnabled('')).toBe(false)
    expect(isDraftHandoffEnabled(null)).toBe(false)
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
    const u = buildWriterUser({ brief: 'Cover VVV burns', preferredFormat: 'article' }, true)
    expect(u).toMatch(/Apply the REGISTER voice/)
    expect(u).toMatch(/FORMAT=article/)
    expect(buildWriterUser({ brief: 'x' }, false)).not.toMatch(/REGISTER voice/)
  })
})

describe('buildWriterSystem', () => {
  it('appends the register inject and reminds format scaling', () => {
    const sys = buildWriterSystem('REGISTER — HARD STYLE CONSTRAINT\nDescription: terse')
    expect(sys).toMatch(/REGISTER — HARD STYLE CONSTRAINT/)
    expect(sys).toMatch(/scale length and paragraphing/)
    expect(sys).not.toMatch(/REGISTER OVERRIDE/)
    expect(buildWriterSystem(null)).not.toMatch(/REGISTER OVERRIDE/)
  })

  it('always injects CRAFT craft guidance', () => {
    const sys = buildWriterSystem(null)
    expect(sys).toMatch(/## CRAFT/)
    expect(sys).toMatch(/Specificity beats cleverness/)
    expect(sys).toMatch(/HOOK PATTERNS/)
    expect(sys).toMatch(/ANTI-PATTERNS/)
  })

  it('always hard-fails on SPENT / PRIOR ART reuse', () => {
    const sys = buildWriterSystem(null)
    expect(sys).toMatch(/SPENT \/ PRIOR ART/)
    expect(sys).toMatch(/FAILED draft/)
  })

  it('instructs writer to use conversation + brief when hasConversation', () => {
    const sys = buildWriterSystem(null, { hasConversation: true })
    expect(sys).toMatch(/research conversation context AND a writing brief/i)
    expect(sys).toMatch(/NO tools/i)
    expect(sys).toMatch(/compose_write_draft/)
    expect(buildWriterSystem(null, { hasConversation: false })).toMatch(/Follow the brief tightly/)
  })

  it('keeps casual-register override when conversation is attached', () => {
    const sys = buildWriterSystem(null, { hasConversation: true })
    expect(sys).toMatch(/casual/i)
  })
})

describe('packConversationForWriter', () => {
  it('packs user/assistant turns and drops system/tool', () => {
    const packed = packConversationForWriter([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'Research Oregon and SpaceX' },
      { role: 'assistant', content: 'Oregon + orbital compute angle.' },
      { role: 'tool', content: '{"ok":true}', tool_call_id: 't1' },
    ])
    expect(packed).toMatch(/User:\nResearch Oregon/)
    expect(packed).toMatch(/Research model:\nOregon/)
    expect(packed).not.toMatch(/sys/)
    expect(packed).not.toMatch(/ok/)
  })

  it('scrubs compose_write_draft ritual from research turns', () => {
    const packed = packConversationForWriter([
      {
        role: 'assistant',
        content:
          'Calling compose_write_draft({ "brief": "write about DIEM", "format": "post" }) now.',
      },
      { role: 'user', content: 'Craft a post about DIEM mint window' },
    ])
    expect(packed).not.toMatch(/compose_write_draft/)
    expect(packed).toMatch(/Craft a post about DIEM/)
  })

  it('keeps recent turns when over maxChars', () => {
    const packed = packConversationForWriter(
      [
        { role: 'user', content: 'AAAA' },
        { role: 'assistant', content: 'BBBB' },
        { role: 'user', content: 'CCCC' },
      ],
      40,
    )
    expect(packed).toMatch(/CCCC/)
    expect(packed).toMatch(/omitted for length/)
    expect(packed).not.toMatch(/AAAA/)
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

describe('buildWriterUser with conversation', () => {
  it('prepends research conversation before the brief', () => {
    const u = buildWriterUser({ brief: 'Write the article' }, false, 'User:\nDo Plan L')
    expect(u).toMatch(/Research context/)
    expect(u).toMatch(/Do Plan L/)
    expect(u).toMatch(/Brief:\nWrite the article/)
  })

  it('includes spentText as a dedicated section before conversation', () => {
    const u = buildWriterUser(
      { brief: 'Write the post' },
      false,
      'User:\nAngle',
      '## SPENT / PRIOR ART\n- opener: Old line',
    )
    expect(u.indexOf('## SPENT / PRIOR ART')).toBeLessThan(u.indexOf('Research context'))
    expect(u).toMatch(/Old line/)
    expect(u).toMatch(/Brief:\nWrite the post/)
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

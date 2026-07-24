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
  repairToolMessagePairs,
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

  it('parses quote target', () => {
    expect(
      parseDraftWriteBrief({
        target: { kind: 'quote', postId: '2080451660992630981', username: 'Austin' },
      }).target,
    ).toEqual({
      kind: 'quote',
      postId: '2080451660992630981',
      username: 'Austin',
    })
  })

  it('accepts reply-shaped field names on quote targets', () => {
    expect(
      parseDraftWriteBrief({
        target: {
          kind: 'quote',
          toPostId: '2080451660992630981',
          toUsername: 'Austin',
        },
      }).target,
    ).toEqual({
      kind: 'quote',
      postId: '2080451660992630981',
      username: 'Austin',
    })
  })

  it('keeps quote target when username is missing (caller may backfill)', () => {
    expect(
      parseDraftWriteBrief({
        target: { kind: 'quote', postId: '2080451660992630981' },
      }).target,
    ).toEqual({ kind: 'quote', postId: '2080451660992630981', username: '' })
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
    const u = buildWriterUser({ intent: '≤280', preferredFormat: 'post' })
    expect(u).toMatch(/Intent: ≤280/)
  })
})

describe('buildDraftStageSystem / buildWriterSystem', () => {
  it('appends the register inject and writing policy', () => {
    const sys = buildDraftStageSystem('REGISTER — HARD STYLE CONSTRAINT\nDescription: terse')
    expect(sys).toMatch(/REGISTER — HARD STYLE CONSTRAINT/)
    expect(sys).toMatch(/scale length and paragraphing/)
    expect(sys).toMatch(/NO tools/)
    expect(sys).toMatch(/STYLE POLICY/)
    expect(sys).toMatch(/SPENT \/ PRIOR ART/)
    expect(sys).not.toMatch(/## CRAFT/)
    expect(buildWriterSystem(null)).toMatch(/draft stage/)
  })

  it('injects STYLE POLICY and never CRAFT', () => {
    const sys = buildDraftStageSystem(null)
    expect(sys).toMatch(/STYLE POLICY/)
    expect(sys).toMatch(/Register is the only style authority/)
    expect(sys).toMatch(/No theatre/)
    expect(sys).not.toMatch(/## CRAFT/)
    expect(sys).not.toMatch(/HOOK PATTERNS/)
    expect(sys).not.toMatch(/ANTI-PATTERNS/)
    expect(sys).not.toMatch(/Specificity beats cleverness/)
  })
})

describe('repairToolMessagePairs', () => {
  it('keeps complete tool_use + tool_result pairs', () => {
    const repaired = repairToolMessagePairs([
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 't1', type: 'function', function: { name: 'x', arguments: '{}' } },
        ],
      },
      { role: 'tool', content: '{"ok":true}', tool_call_id: 't1' },
    ])
    expect(repaired).toHaveLength(3)
    expect(repaired[1]?.tool_calls).toHaveLength(1)
    expect(repaired[2]?.tool_call_id).toBe('t1')
  })

  it('strips tool_use when tool_result is missing', () => {
    const repaired = repairToolMessagePairs([
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: 'thinking…',
        tool_calls: [
          { id: 't1', type: 'function', function: { name: 'x', arguments: '{}' } },
        ],
      },
      { role: 'user', content: 'write now' },
    ])
    expect(repaired).toEqual([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'thinking…' },
      { role: 'user', content: 'write now' },
    ])
  })

  it('drops orphan tool results', () => {
    const repaired = repairToolMessagePairs([
      { role: 'tool', content: '{"ok":true}', tool_call_id: 'orphan' },
      { role: 'user', content: 'hi' },
    ])
    expect(repaired).toEqual([{ role: 'user', content: 'hi' }])
  })
})

describe('ensureToolResultPairs via buildDraftStageMessages', () => {
  it('stubs missing tool_result before write-now (Claude messages.2 regression)', () => {
    const msgs = buildDraftStageMessages(
      [
        { role: 'user', content: 'Draft a post' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'toolu_01XGFmFRHtcdJJFGAY6BkdwP',
              type: 'function',
              function: { name: 'compose_write_draft', arguments: '{}' },
            },
          ],
        },
        // Intentionally no tool_result — old handoff shape that Claude rejects.
      ],
      { preferredFormat: 'post', intent: '≤280' },
    )
    const assistantIdx = msgs.findIndex((m) => m.role === 'assistant' && m.tool_calls)
    expect(assistantIdx).toBeGreaterThanOrEqual(0)
    expect(msgs[assistantIdx + 1]).toEqual(
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'toolu_01XGFmFRHtcdJJFGAY6BkdwP',
      }),
    )
    expect(msgs[msgs.length - 1]?.role).toBe('user')
    expect(String(msgs[msgs.length - 1]?.content)).toMatch(/DRAFT STAGE/)
  })
})

describe('buildDraftStageMessages', () => {
  it('replaces research system and appends write-now', () => {
    const msgs = buildDraftStageMessages(
      [
        { role: 'system', content: 'research system' },
        { role: 'user', content: 'Craft a post' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 't1', type: 'function', function: { name: 'x', arguments: '{}' } },
          ],
        },
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

  it('does not leave unpaired tool_use after truncation', () => {
    const bulky = 'x'.repeat(40_000)
    const msgs = buildDraftStageMessages(
      [
        { role: 'user', content: bulky },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'old', type: 'function', function: { name: 'x', arguments: '{}' } },
          ],
        },
        { role: 'tool', content: bulky, tool_call_id: 'old' },
        { role: 'user', content: 'draft please' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'draft',
              type: 'function',
              function: { name: 'compose_write_draft', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', content: '{"status":"started"}', tool_call_id: 'draft' },
      ],
      { preferredFormat: 'post' },
      null,
      8_000,
    )
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]!
      if (m.role === 'assistant' && m.tool_calls?.length) {
        const ids = new Set(m.tool_calls.map((c) => c.id))
        let j = i + 1
        while (j < msgs.length && msgs[j]!.role === 'tool') {
          const id = msgs[j]!.tool_call_id
          if (id) ids.delete(id)
          j += 1
        }
        expect(ids.size).toBe(0)
      }
    }
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

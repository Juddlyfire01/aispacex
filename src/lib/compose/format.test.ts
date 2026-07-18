import { describe, it, expect } from 'vitest'
import {
  resolveDraftFormat,
  PREFERRED_FORMATS,
  clearArticleIfStale,
  promoteDraftToArticle,
} from './format'
import { emptyDraft, emptySegment, emptyArticleDraft } from './types'

describe('resolveDraftFormat', () => {
  it('resolves article when title or body present', () => {
    const d = emptyDraft()
    d.article = { title: 'T', bodyMarkdown: '', inlineMedia: [] }
    expect(resolveDraftFormat(d)).toBe('article')
  })

  it('resolves thread for multiple segments', () => {
    const d = emptyDraft()
    d.segments = [emptySegment(), emptySegment()]
    expect(resolveDraftFormat(d)).toBe('thread')
  })

  it('resolves longform for single longform segment', () => {
    const d = emptyDraft()
    d.longform = true
    expect(resolveDraftFormat(d)).toBe('longform')
  })

  it('resolves post otherwise', () => {
    const d = emptyDraft()
    d.longform = false
    expect(resolveDraftFormat(d)).toBe('post')
  })
})

describe('PREFERRED_FORMATS', () => {
  it('lists auto and four shapes', () => {
    expect(PREFERRED_FORMATS.map((f) => f.value)).toEqual([
      'auto',
      'post',
      'thread',
      'longform',
      'article',
    ])
  })
})

describe('clearArticleIfStale', () => {
  it('sets article undefined on non-article resolve even when patch omits article', () => {
    const patch = { longform: false }
    expect(clearArticleIfStale(patch, 'post')).toEqual({ longform: false, article: undefined })
    expect(clearArticleIfStale(patch, 'thread')).toEqual({ longform: false, article: undefined })
    expect(clearArticleIfStale(patch, 'longform')).toEqual({
      longform: false,
      article: undefined,
    })
  })

  it('preserves patch.article when nextResolved is article', () => {
    const article = emptyArticleDraft()
    article.title = 'Keep me'
    const patch = { article }
    expect(clearArticleIfStale(patch, 'article')).toEqual({ article })
  })
})

describe('promoteDraftToArticle', () => {
  it('returns null when article already has content', () => {
    const d = emptyDraft()
    d.article = { ...emptyArticleDraft(), title: 'Keep', bodyMarkdown: 'Body' }
    d.segments = [{ ...emptySegment(), text: 'ignored' }]
    expect(promoteDraftToArticle(d)).toBeNull()
  })

  it('migrates segment text into article instead of wiping it', () => {
    const d = emptyDraft()
    d.segments = [{ ...emptySegment(), text: '# Liberty\n\nMoney and the state.' }]
    const patch = promoteDraftToArticle(d)
    expect(patch?.article?.title).toBe('Liberty')
    expect(patch?.article?.bodyMarkdown).toBe('Money and the state.')
    expect(patch?.segments).toHaveLength(1)
    expect(patch?.segments?.[0]?.text).toBe('')
  })

  it('migrates plain segment text as body when no # title', () => {
    const d = emptyDraft()
    d.segments = [{ ...emptySegment(), text: 'Plain manuscript without a heading.' }]
    const patch = promoteDraftToArticle(d)
    expect(patch?.article?.title).toBe('')
    expect(patch?.article?.bodyMarkdown).toBe('Plain manuscript without a heading.')
  })

  it('seeds empty article only when there is no segment copy', () => {
    const d = emptyDraft()
    const patch = promoteDraftToArticle(d)
    expect(patch?.article?.title).toBe('')
    expect(patch?.article?.bodyMarkdown).toBe('')
  })

  it('returns null when empty article shell already exists and segments are empty', () => {
    const d = emptyDraft()
    d.article = emptyArticleDraft()
    expect(promoteDraftToArticle(d)).toBeNull()
  })

  it('promotes into existing empty article shell from segments', () => {
    const d = emptyDraft()
    d.article = emptyArticleDraft()
    d.segments = [{ ...emptySegment(), text: '# Title\n\nBody copy.' }]
    const patch = promoteDraftToArticle(d)
    expect(patch?.article?.title).toBe('Title')
    expect(patch?.article?.bodyMarkdown).toBe('Body copy.')
  })
})

import { describe, it, expect } from 'vitest'
import { resolveDraftFormat, PREFERRED_FORMATS, clearArticleIfStale } from './format'
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

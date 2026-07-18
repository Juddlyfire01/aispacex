import { describe, it, expect } from 'vitest'
import {
  computeStyleFeatures,
  computeStyleFeaturesReport,
  tokenize,
  splitSentences,
} from './style-features'

describe('tokenize', () => {
  it('lowercases and strips urls', () => {
    expect(tokenize('Hello YOU https://x.com/a world')).toEqual(['hello', 'you', 'world'])
  })
})

describe('splitSentences', () => {
  it('splits on punctuation and newlines', () => {
    expect(splitSentences('One. Two?\nThree!')).toEqual(['One.', 'Two?', 'Three!'])
  })
})

describe('computeStyleFeatures', () => {
  it('returns zeros for empty corpus', () => {
    const f = computeStyleFeatures([])
    expect(f.postCount).toBe(0)
    expect(f.tokenCount).toBe(0)
    expect(f.youRate).toBe(0)
  })

  it('counts you / I / hedges / questions', () => {
    const f = computeStyleFeatures([
      'Hey you, I think maybe you are right?',
      "I'm certain you'll always win!",
    ])
    expect(f.postCount).toBe(2)
    expect(f.tokenCount).toBeGreaterThan(0)
    expect(f.youRate).toBeGreaterThan(0)
    expect(f.iRate).toBeGreaterThan(0)
    expect(f.hedgeRate).toBeGreaterThan(0)
    expect(f.certaintyRate).toBeGreaterThan(0)
    expect(f.questionRate).toBeGreaterThan(0)
    expect(f.exclaimRate).toBeGreaterThan(0)
    expect(f.avgPostChars).toBeGreaterThan(0)
  })

  it('detects quant patterns and links', () => {
    const f = computeStyleFeatures(['Price hit $1.2M (~45%) see https://example.com/x'])
    expect(f.quantRate).toBeGreaterThan(0)
    expect(f.linkRate).toBeGreaterThan(0)
  })

  it('computes sentence length stats', () => {
    const f = computeStyleFeatures(['Short one. This second sentence has more words in it.'])
    expect(f.avgSentenceLen).toBeGreaterThan(0)
    expect(f.sentenceLenCv).toBeGreaterThan(0)
  })
})

describe('computeStyleFeaturesReport', () => {
  it('splits by format so articles do not dominate post averages alone', () => {
    const report = computeStyleFeaturesReport([
      { text: 'Short.', format: 'post' },
      { text: 'Short two.', format: 'post' },
      {
        text: 'A much longer article body with many sentences. Another paragraph follows here for length.',
        format: 'article',
      },
    ])
    expect(report.formatCounts).toEqual({ post: 2, longform: 0, article: 1 })
    expect(report.byFormat.post.postCount).toBe(2)
    expect(report.byFormat.article.postCount).toBe(1)
    expect(report.overall.postCount).toBe(3)
    expect(report.byFormat.article.avgPostChars).toBeGreaterThan(report.byFormat.post.avgPostChars)
  })
})

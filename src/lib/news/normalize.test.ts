import { describe, it, expect } from 'vitest'
import { stripHtml, truncate, hashId, extractImageUrl, toIso, stripLinkAggregatorMeta } from './normalize'

describe('stripHtml', () => {
  it('removes tags and decodes basic entities', () => {
    expect(stripHtml('<p>Hello &amp; <b>world</b></p>')).toBe('Hello & world')
  })
  it('collapses whitespace', () => {
    expect(stripHtml('a\n\n  b')).toBe('a b')
  })
})

describe('truncate', () => {
  it('keeps short strings', () => {
    expect(truncate('short', 20)).toBe('short')
  })
  it('cuts on a word boundary and adds ellipsis', () => {
    expect(truncate('one two three four', 9)).toBe('one two…')
  })
})

describe('hashId', () => {
  it('is stable and url-derived', () => {
    expect(hashId('https://x.com/a')).toBe(hashId('https://x.com/a'))
    expect(hashId('https://x.com/a')).not.toBe(hashId('https://x.com/b'))
  })
})

describe('extractImageUrl', () => {
  it('reads a src attr from an <img> in html', () => {
    expect(extractImageUrl('<img src="https://c.dn/i.jpg">')).toBe('https://c.dn/i.jpg')
  })
  it('returns undefined when none', () => {
    expect(extractImageUrl('no image here')).toBeUndefined()
  })
})

describe('toIso', () => {
  it('parses RFC-822 dates', () => {
    expect(toIso('Tue, 07 Jul 2026 06:00:00 GMT')).toBe('2026-07-07T06:00:00.000Z')
  })
  it('returns empty string for junk', () => {
    expect(toIso('not a date')).toBe('')
  })
})

describe('stripLinkAggregatorMeta', () => {
  it('strips the hnrss.org-style Article/Comments/Points bookkeeping block', () => {
    const input =
      'Article URL: https://bradleywoolf.com/links-1/sequencing-my-own-dna-at-home ' +
      'Comments URL: https://news.ycombinator.com/item?id=48812156 Points: 161 # Comments: 52'
    expect(stripLinkAggregatorMeta(input)).toBe('')
  })

  it('leaves real prose from a Show HN style body intact', () => {
    const input = 'Comments URL: https://news.ycombinator.com/item?id=48812045 Points: 18 # Comments: 18'
    const withProse = `I built a thing that does a cool thing. ${input}`
    expect(stripLinkAggregatorMeta(withProse)).toBe('I built a thing that does a cool thing.')
  })

  it('is a no-op on content with no aggregator metadata', () => {
    const plain = 'Just a normal article summary with no metadata lines.'
    expect(stripLinkAggregatorMeta(plain)).toBe(plain)
  })
})

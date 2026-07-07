import { describe, it, expect } from 'vitest'
import { tweetLength, remaining, containsUrl, countUrls } from './tweet-length'

describe('tweetLength', () => {
  it('counts plain text by code point', () => {
    expect(tweetLength('hello')).toBe(5)
    expect(tweetLength('')).toBe(0)
  })

  it('counts astral chars (emoji) as single code points', () => {
    expect(tweetLength('🚀')).toBe(1)
    expect(tweetLength('a🚀b')).toBe(3)
  })

  it('weights a URL as 23 chars regardless of real length', () => {
    // The literal URL is far longer than 23 chars.
    expect(tweetLength('https://example.com/a/very/long/path/that/exceeds/limit')).toBe(23)
  })

  it('combines text and URL weighting', () => {
    // "see " = 4 chars + URL(23) = 27
    expect(tweetLength('see https://example.com')).toBe(27)
  })

  it('counts multiple URLs each at 23', () => {
    expect(tweetLength('https://a.com https://b.com')).toBe(23 + 1 + 23)
  })
})

describe('remaining', () => {
  it('returns limit minus weighted length', () => {
    expect(remaining('hello', 280)).toBe(275)
  })

  it('goes negative when over limit', () => {
    expect(remaining('x'.repeat(281), 280)).toBe(-1)
  })
})

describe('countUrls / containsUrl', () => {
  it('detects http urls', () => {
    expect(containsUrl('visit https://x.com now')).toBe(true)
    expect(countUrls('https://a.io and https://b.dev')).toBe(2)
  })

  it('detects bare domains with known TLDs', () => {
    expect(containsUrl('go to venice.ai today')).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(containsUrl('just some words here')).toBe(false)
    expect(countUrls('no links at all')).toBe(0)
  })
})

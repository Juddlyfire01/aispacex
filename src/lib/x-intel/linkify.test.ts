import { describe, it, expect } from 'vitest'
import { linkify, condenseUrlLabel } from './linkify'

describe('condenseUrlLabel', () => {
  it('strips protocol and www', () => {
    expect(condenseUrlLabel('https://www.venice.ai')).toBe('venice.ai')
    expect(condenseUrlLabel('https://example.com/path?q=1')).toBe('example.com/path?q=1')
  })

  it('leaves t.co unchanged', () => {
    expect(condenseUrlLabel('https://t.co/abc123')).toBe('https://t.co/abc123')
  })
})

describe('linkify', () => {
  it('returns a single text token for plain text', () => {
    expect(linkify('just plain words')).toEqual([{ type: 'text', value: 'just plain words' }])
  })

  it('extracts a url token with condensed fallback label', () => {
    const t = linkify('Private & Unrestricted AI | https://t.co/iIt1pyF1TK')
    expect(t[0]).toEqual({ type: 'text', value: 'Private & Unrestricted AI | ' })
    expect(t[1]).toEqual({ type: 'url', value: 'https://t.co/iIt1pyF1TK', href: 'https://t.co/iIt1pyF1TK' })
  })

  it('uses X display_url from bio entities when provided', () => {
    const t = linkify('Founder of https://t.co/iUPC8ij60f', [
      { url: 'https://t.co/iUPC8ij60f', expanded: 'https://venice.ai', display: 'Venice.ai' },
    ])
    expect(t[1]).toEqual({ type: 'url', value: 'Venice.ai', href: 'https://t.co/iUPC8ij60f' })
  })

  it('uses entity start/end indices when present (X display rules)', () => {
    const bio = 'Founder of https://t.co/iUPC8ij60f'
    const t = linkify(bio, [
      {
        url: 'https://t.co/iUPC8ij60f',
        expanded: 'https://venice.ai',
        display: 'Venice.ai',
        start: 11,
        end: 34,
      },
    ])
    expect(t.map((x) => x.type)).toEqual(['text', 'url'])
    expect(t[0]).toEqual({ type: 'text', value: 'Founder of ' })
    expect(t[1]).toEqual({ type: 'url', value: 'Venice.ai', href: 'https://t.co/iUPC8ij60f' })
  })

  it('condenses plain https URLs without entities', () => {
    const t = linkify('see https://example.com/page, ok')
    expect(t[1]).toEqual({ type: 'url', value: 'example.com/page', href: 'https://example.com/page' })
    expect(t[2]).toEqual({ type: 'text', value: ',' })
    expect(t[3]).toEqual({ type: 'text', value: ' ok' })
  })

  it('extracts mention tokens', () => {
    const t = linkify('follows @ErikVoorhees closely')
    expect(t[1]).toEqual({ type: 'mention', value: '@ErikVoorhees', username: 'ErikVoorhees' })
  })

  it('extracts hashtag tokens', () => {
    const t = linkify('building #crypto and #AI')
    expect(t.find((x) => x.type === 'hashtag')).toEqual({ type: 'hashtag', value: '#crypto', tag: 'crypto' })
  })

  it('handles a mention at the very start', () => {
    const t = linkify('@venice_ai builds tools')
    expect(t[0]).toEqual({ type: 'mention', value: '@venice_ai', username: 'venice_ai' })
  })

  it('does not treat an email-like @ as a mention', () => {
    const t = linkify('contact me at foo@bar for details')
    expect(t.every((x) => x.type !== 'mention')).toBe(true)
  })

  it('mixes multiple token types in order', () => {
    const t = linkify('@a #b https://x.co done')
    expect(t.map((x) => x.type)).toEqual(['mention', 'text', 'hashtag', 'text', 'url', 'text'])
  })

  it('links an ENS name to Etherscan', () => {
    const t = linkify('gm willywonka.eth ser')
    expect(t[1]).toEqual({
      type: 'eth',
      value: 'willywonka.eth',
      href: 'https://etherscan.io/address/willywonka.eth',
    })
  })

  it('links a raw Ethereum address to Etherscan', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678'
    const t = linkify(`send to ${addr} now`)
    expect(t[1]).toEqual({
      type: 'eth',
      value: addr,
      href: `https://etherscan.io/address/${addr}`,
    })
  })

  it('does not treat an ordinary domain as an ENS name', () => {
    const t = linkify('visit venice.ai today')
    expect(t.every((x) => x.type !== 'eth')).toBe(true)
  })
})

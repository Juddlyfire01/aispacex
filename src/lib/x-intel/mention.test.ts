import { describe, it, expect } from 'vitest'
import { MENTION_RE, mentionHref, usernameFromHref } from './mention'

function matches(text: string): string[] {
  const re = new RegExp(MENTION_RE.source, 'g')
  const out: string[] = []
  for (const m of text.matchAll(re)) out.push(m[1])
  return out
}

describe('MENTION_RE', () => {
  it('matches a bare @handle', () => {
    expect(matches('follows @ErikVoorhees closely')).toEqual(['ErikVoorhees'])
  })

  it('matches a handle at the very start', () => {
    expect(matches('@venice_ai ships tools')).toEqual(['venice_ai'])
  })

  it('does not match an email-like @', () => {
    expect(matches('contact foo@bar.com please')).toEqual([])
  })

  it('matches a full 15-char handle (X limit)', () => {
    expect(matches('@abcdefghijklmno done')).toEqual(['abcdefghijklmno'])
  })

  it('does not match an over-limit 16+ char run (no valid boundary)', () => {
    // Mirrors the shared linkify() behavior: \w{1,15}\b can\'t satisfy the word
    // boundary mid-run, so an over-length token is left as plain text.
    expect(matches('@abcdefghijklmnop')).toEqual([])
  })

  it('finds multiple mentions', () => {
    expect(matches('cc @a and @b')).toEqual(['a', 'b'])
  })
})

describe('mention sentinel href', () => {
  it('round-trips a username', () => {
    expect(usernameFromHref(mentionHref('ErikVoorhees'))).toBe('ErikVoorhees')
  })

  it('returns null for a non-sentinel href', () => {
    expect(usernameFromHref('https://x.com/foo')).toBeNull()
    expect(usernameFromHref(undefined)).toBeNull()
  })
})

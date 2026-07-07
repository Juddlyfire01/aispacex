import { describe, it, expect } from 'vitest'
import { twemojiUrl } from './twemoji'

describe('twemojiUrl', () => {
  it('builds a jsdelivr URL from unified codepoints', () => {
    expect(twemojiUrl('1FAE0')).toBe(
      'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1fae0.png',
    )
    expect(twemojiUrl('1f44d-1f3fb')).toBe(
      'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f44d-1f3fb.png',
    )
  })
})

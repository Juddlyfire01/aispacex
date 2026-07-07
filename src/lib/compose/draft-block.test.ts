import { describe, it, expect } from 'vitest'
import { parseDraftBlock } from './draft-block'

describe('parseDraftBlock', () => {
  it('returns null draft and original text when no block present', () => {
    const content = 'Just a normal chat reply with no draft.'
    const result = parseDraftBlock(content)
    expect(result.draft).toBeNull()
    expect(result.visibleText).toBe(content)
  })

  it('parses a postdraft block and strips it from visible text', () => {
    const content = `Here is a draft for you:

\`\`\`postdraft
{ "segments": [{ "text": "Hello world" }], "target": { "kind": "original" } }
\`\`\`

Let me know if you want changes.`
    const result = parseDraftBlock(content)
    expect(result.draft).not.toBeNull()
    expect(result.draft?.segments).toHaveLength(1)
    expect(result.draft?.segments?.[0].text).toBe('Hello world')
    expect(result.draft?.target).toEqual({ kind: 'original' })
    expect(result.visibleText).not.toContain('postdraft')
    expect(result.visibleText).toContain('Here is a draft for you')
    expect(result.visibleText).toContain('Let me know if you want changes')
  })

  it('accepts segments given as plain strings', () => {
    const content = '```postdraft\n{ "segments": ["one", "two"] }\n```'
    const result = parseDraftBlock(content)
    expect(result.draft?.segments?.map((s) => s.text)).toEqual(['one', 'two'])
  })

  it('normalizes a reply target', () => {
    const content = '```postdraft\n{ "segments": ["hi"], "target": { "kind": "reply", "toPostId": "42", "toUsername": "bob" } }\n```'
    const result = parseDraftBlock(content)
    expect(result.draft?.target).toEqual({ kind: 'reply', toPostId: '42', toUsername: 'bob' })
  })

  it('returns null draft on malformed JSON but still strips the block', () => {
    const content = 'text\n```postdraft\n{ not valid json ]\n```\nmore'
    const result = parseDraftBlock(content)
    expect(result.draft).toBeNull()
    expect(result.visibleText).not.toContain('postdraft')
  })

  it('ignores an empty/unusable object', () => {
    const content = '```postdraft\n{ "unknown": true }\n```'
    const result = parseDraftBlock(content)
    expect(result.draft).toBeNull()
  })
})

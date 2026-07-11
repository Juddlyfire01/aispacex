import { describe, it, expect } from 'vitest'
import { markdownToContentState } from './article-draftjs'

describe('markdownToContentState', () => {
  it('maps paragraphs to unstyled blocks', () => {
    const cs = markdownToContentState('Hello\n\nWorld')
    expect(cs.blocks.map((b) => b.text)).toEqual(['Hello', 'World'])
    expect(cs.blocks.every((b) => b.type === 'unstyled')).toBe(true)
  })

  it('maps # / ## / ### headers', () => {
    const cs = markdownToContentState('# A\n## B\n### C')
    expect(cs.blocks.map((b) => b.type)).toEqual([
      'header-one',
      'header-two',
      'header-three',
    ])
  })

  it('maps unordered list items', () => {
    const cs = markdownToContentState('- one\n* two')
    expect(cs.blocks.map((b) => b.type)).toEqual([
      'unordered-list-item',
      'unordered-list-item',
    ])
    expect(cs.blocks.map((b) => b.text)).toEqual(['one', 'two'])
  })

  it('creates link entities for [text](url)', () => {
    const cs = markdownToContentState('See [docs](https://aispace.bot/)')
    expect(cs.entities.some((e) => e.value.type === 'link')).toBe(true)
    expect(cs.blocks[0].text).toContain('docs')
    expect(cs.blocks[0].text).not.toContain('https://')
    expect(cs.blocks[0].entity_ranges?.length).toBeGreaterThan(0)
  })

  it('inserts image atomic blocks for media map keys', () => {
    const cs = markdownToContentState('Intro\n\n![shot](media:img1)\n\nOutro', {
      images: { img1: { mediaId: '123', mediaKey: '456' } },
    })
    expect(cs.blocks.some((b) => b.type === 'atomic')).toBe(true)
    expect(cs.entities.some((e) => e.value.type === 'image')).toBe(true)
    const image = cs.entities.find((e) => e.value.type === 'image')
    expect(image?.value.data).toEqual({
      media_items: [{ media_id: '123', media_key: '456' }],
      caption: 'shot',
    })
  })

  it('omits media_key and caption when unavailable', () => {
    const cs = markdownToContentState('![](media:img1)', {
      images: { img1: { mediaId: '123' } },
    })
    const image = cs.entities.find((e) => e.value.type === 'image')
    expect(image?.value.data).toEqual({
      media_items: [{ media_id: '123' }],
    })
  })

  it('falls back when image id is missing from map', () => {
    const cs = markdownToContentState('![shot](media:missing)')
    expect(cs.blocks.some((b) => b.type === 'atomic')).toBe(false)
    expect(cs.entities.some((e) => e.value.type === 'image')).toBe(false)
  })

  it('strips unsupported markdown rather than throwing', () => {
    expect(() =>
      markdownToContentState('Hello **bold** and `code` and ~~strike~~'),
    ).not.toThrow()
    const cs = markdownToContentState('Hello **bold** and `code`')
    expect(cs.blocks[0].text).not.toContain('**')
    expect(cs.blocks[0].text).not.toContain('`')
  })
})

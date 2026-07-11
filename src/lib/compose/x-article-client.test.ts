import { describe, it, expect } from 'vitest'
import { buildArticleMarkdownWithMedia } from './x-article-client'

describe('buildArticleMarkdownWithMedia', () => {
  it('returns body unchanged when all inline ids are already referenced', () => {
    const body = 'Hello\n\n![shot](media:img1)\n\nWorld'
    expect(buildArticleMarkdownWithMedia(body, [{ id: 'img1' }])).toBe(body)
  })

  it('appends missing inline media as markdown image lines', () => {
    const result = buildArticleMarkdownWithMedia('Intro', [
      { id: 'a' },
      { id: 'b' },
    ])
    expect(result).toBe('Intro\n\n![image](media:a)\n\n\n![image](media:b)\n')
  })

  it('only appends ids not already present as media: references', () => {
    const body = 'See ![x](media:keep)\n\nMore'
    const result = buildArticleMarkdownWithMedia(body, [
      { id: 'keep' },
      { id: 'extra' },
    ])
    expect(result).toContain('(media:keep)')
    expect(result).toContain('![image](media:extra)')
    expect(result.match(/media:keep/g)?.length).toBe(1)
  })

  it('handles empty inline list', () => {
    expect(buildArticleMarkdownWithMedia('Just text', [])).toBe('Just text')
  })
})

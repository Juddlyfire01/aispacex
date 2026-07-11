import { describe, it, expect } from 'vitest'
import {
  looksLikeDraftIntent,
  looksLikeLeakedArticle,
  salvageLeakedArticleFromChat,
} from './article-handoff'

describe('looksLikeDraftIntent', () => {
  it('detects draft / article requests', () => {
    expect(looksLikeDraftIntent('draft an article about VVV')).toBe(true)
    expect(looksLikeDraftIntent('use the draft tool')).toBe(true)
    expect(looksLikeDraftIntent('what is staking APR?')).toBe(false)
  })
})

describe('looksLikeLeakedArticle', () => {
  it('flags long titled markdown', () => {
    const body = `# Owning Intelligence\n\n${'paragraph '.repeat(80)}\n\n## Section\n\nmore`
    expect(looksLikeLeakedArticle(body, true)).toBe(true)
  })

  it('ignores short chat replies', () => {
    expect(looksLikeLeakedArticle('Here is a short note.', true)).toBe(false)
  })
})

describe('salvageLeakedArticleFromChat', () => {
  it('parses title, body, and image prompt into article payload', () => {
    const content = `# Title Here

Body of the article with enough length ${'x'.repeat(500)}

## More

Still going ${'y'.repeat(200)}

Image Prompt (techno):
neon vault lattice`
    const salvaged = salvageLeakedArticleFromChat(content)
    expect(salvaged).not.toBeNull()
    expect(salvaged!.article.title).toBe('Title Here')
    expect(salvaged!.article.bodyMarkdown).not.toMatch(/Image Prompt/i)
    expect(salvaged!.article.imagePrompt).toMatch(/neon vault/i)
    expect(salvaged!.chatMessage).toMatch(/drawer/i)
  })
})

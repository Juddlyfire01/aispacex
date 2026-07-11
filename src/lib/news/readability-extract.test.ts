import { describe, it, expect } from 'vitest'
import { extractArticleFromHtml } from './readability-extract'

describe('extractArticleFromHtml', () => {
  it('extracts main article text from simple HTML', () => {
    const html = `<!DOCTYPE html><html><head><title>Site</title></head><body>
      <nav>Home About</nav>
      <article><h1>Big Story Headline</h1>
      <p>${'Interesting paragraph about Venice and VVV. '.repeat(20)}</p>
      <p>${'Second paragraph with more detail for length. '.repeat(20)}</p>
      </article>
      <aside>Related junk</aside>
      </body></html>`
    const result = extractArticleFromHtml(html, 'https://example.com/story')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.article.text).toMatch(/Interesting paragraph/)
    expect(result.article.text).not.toMatch(/Related junk/)
  })

  it('fails on empty html', () => {
    expect(extractArticleFromHtml('', 'https://example.com')).toEqual({
      ok: false,
      reason: 'empty_html',
    })
  })
})

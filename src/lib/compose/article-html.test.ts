import { describe, it, expect } from 'vitest'
import {
  articleHtmlToMarkdown,
  markdownToArticleHtml,
  markdownToArticlePlain,
} from './article-html'

describe('markdownToArticleHtml', () => {
  it('renders headings and paragraphs without markdown markers', () => {
    const html = markdownToArticleHtml('### The Observer Effect\n\nBeing watched changes agents.')
    expect(html).toContain('<h3>')
    expect(html).toContain('The Observer Effect')
    expect(html).toContain('<p>')
    expect(html).not.toContain('###')
  })

  it('renders bold as strong', () => {
    const html = markdownToArticleHtml('Hello **world**')
    expect(html).toContain('<strong>world</strong>')
    expect(html).not.toContain('**')
  })

  it('skips horizontal rules', () => {
    const html = markdownToArticleHtml('A\n\n---\n\nB')
    expect(html).not.toContain('---')
    expect(html).toContain('>A<')
    expect(html).toContain('>B<')
  })
})

describe('markdownToArticlePlain', () => {
  it('drops markdown markers', () => {
    const plain = markdownToArticlePlain('### Title\n\nHello **bold**')
    expect(plain).toBe('Title\n\nHello bold')
  })
})

describe('articleHtmlToMarkdown', () => {
  it('round-trips simple structure', () => {
    const md = articleHtmlToMarkdown('<h3>Hello</h3><p>World <strong>x</strong></p>')
    expect(md).toContain('### Hello')
    expect(md).toContain('**x**')
    expect(md).toMatch(/World/)
  })
})

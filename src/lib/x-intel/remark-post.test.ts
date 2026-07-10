import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkPost } from './remark-post'
import { remarkMention } from './remark-mention'
import { POST_SCHEME, postIdFromHref } from './evidence'
import { MENTION_SCHEME, usernameFromHref } from './mention'

function safeUrlTransform(url: string): string {
  if (!url) return ''
  if (url.startsWith(POST_SCHEME)) return url
  if (url.startsWith(MENTION_SCHEME)) return url
  return defaultUrlTransform(url)
}

function render(md: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkMention, remarkPost],
        urlTransform: safeUrlTransform,
        components: {
          a: ({ href, children }) => {
            const postId = postIdFromHref(href)
            if (postId) return createElement('span', { 'data-post': postId }, children)
            const user = usernameFromHref(href)
            if (user) return createElement('span', { 'data-user': user }, children)
            return createElement('a', { href }, children)
          },
        },
      },
      md,
    ),
  )
}

describe('remarkPost via react-markdown', () => {
  it('turns bare snowflake ids into post links', () => {
    const html = render('See id 2073269941021929793 please.')
    expect(html).toContain('data-post="2073269941021929793"')
    expect(html).toContain('2073269941021929793')
  })

  it('turns post:-prefixed ids into post links', () => {
    const html = render('cite post:2072424262422663246 here')
    expect(html).toContain('data-post="2072424262422663246"')
  })

  it('links comma-grouped snowflake ids (model "prettified" them)', () => {
    const html = render('see 2,075,587,500,908,333,628 for reach')
    expect(html).toContain('data-post="2075587500908333628"')
  })

  it('does not link ordinary comma-grouped numbers', () => {
    const html = render('reduced from 1,200,000 to 900,000 users')
    expect(html).not.toContain('data-post')
  })

  it('links slash-separated mentions and nearby post ids', () => {
    const html = render(
      'critics like @Crypdjo/@AlgodTrading — see 2073269941021929793',
    )
    expect(html).toContain('data-user="Crypdjo"')
    expect(html).toContain('data-user="AlgodTrading"')
    expect(html).toContain('data-post="2073269941021929793"')
  })
})

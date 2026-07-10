import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkEtherscan } from './remark-etherscan'
import { remarkMention } from './remark-mention'
import { remarkPost } from './remark-post'
import { ETH_IDENTITY_SCHEME, identityFromHref } from './etherscan'
import { MENTION_SCHEME, usernameFromHref } from './mention'
import { POST_SCHEME, postIdFromHref, postIdFromStatusUrl } from './evidence'

// Mirror MarkdownMessage's transform + link routing so we can assert without
// pulling in Zustand-backed PostLink/MentionLink components.
function safeUrlTransform(url: string): string {
  if (!url) return ''
  if (url.startsWith(ETH_IDENTITY_SCHEME)) return url
  if (url.startsWith(MENTION_SCHEME)) return url
  if (url.startsWith(POST_SCHEME)) return url
  const cleaned = defaultUrlTransform(url)
  if (!cleaned) return ''
  if (/^(https?:|mailto:|#|\/|\.)/i.test(cleaned)) return cleaned
  return ''
}

function render(content: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkEtherscan, remarkMention, remarkPost],
        urlTransform: safeUrlTransform,
        components: {
          a: ({ href, children }) => {
            const identity = identityFromHref(href)
            if (identity) return createElement('span', { 'data-eth': identity }, children)
            const username = usernameFromHref(href)
            if (username) return createElement('span', { 'data-user': username }, children)
            const postId = postIdFromHref(href) ?? postIdFromStatusUrl(href)
            if (postId) return createElement('span', { 'data-post': postId }, children)
            return createElement('a', { href }, children)
          },
        },
      },
      content,
    ),
  )
}

describe('compose-style markdown post/mention linking', () => {
  it('links bare snowflake after Post ID:', () => {
    const html = render('Post ID: 2075587500908333628')
    expect(html).toContain('data-post="2075587500908333628"')
  })

  it('links id= snowflake form from agent replies', () => {
    // User screenshot: "Merch shop launch (id=2074245071577983824, July 6"
    const html = render(
      '2. Merch shop launch (id=2074245071577983824, July 6, ~28 likes)',
    )
    expect(html).toContain('data-post="2074245071577983824"')
  })

  it('links bare id in prose', () => {
    const html = render('Post as a direct reply to 2075585701392032158 for max.')
    expect(html).toContain('data-post="2075585701392032158"')
  })

  it('links @mentions in bold', () => {
    const html = render('**@Everything_Alt** (crypto YouTuber)')
    expect(html).toContain('data-user="Everything_Alt"')
  })

  it('links status URLs', () => {
    const html = render('https://x.com/i/status/2075585701392032158')
    expect(html).toContain('data-post="2075585701392032158"')
  })

  it('links multiple ids in one line', () => {
    const html = render(
      'id=207321278885305226, July 4 and id=207426012436502421 by @klausbrave',
    )
    expect(html).toContain('data-post="207321278885305226"')
    expect(html).toContain('data-post="207426012436502421"')
    expect(html).toContain('data-user="klausbrave"')
  })
})

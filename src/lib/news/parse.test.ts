import { describe, it, expect } from 'vitest'
import { parseFeed } from './parse'
import type { NewsFeed } from './types'

const feed: NewsFeed = { id: 'f1', name: 'Test', url: 'https://t/', category: 'ai' }

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>First</title><link>https://t/a</link>
<description>&lt;p&gt;Body one&lt;/p&gt;</description>
<pubDate>Tue, 07 Jul 2026 06:00:00 GMT</pubDate>
<enclosure url="https://t/a.jpg" type="image/jpeg"/></item>
<item><title>Second</title><link>https://t/b</link>
<description>Body two</description></item>
</channel></rss>`

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Atom One</title><link href="https://t/x"/>
<summary>Atom body</summary><updated>2026-07-07T06:00:00Z</updated></entry>
</feed>`

describe('parseFeed (RSS)', () => {
  const items = parseFeed(RSS, feed)
  it('parses both items', () => expect(items).toHaveLength(2))
  it('sets title, url, feedId, category, sourceName', () => {
    expect(items[0]).toMatchObject({
      title: 'First', url: 'https://t/a', feedId: 'f1', category: 'ai', sourceName: 'Test',
    })
  })
  it('strips html from summary', () => expect(items[0].summary).toBe('Body one'))
  it('parses pubDate to ISO', () => expect(items[0].publishedAt).toBe('2026-07-07T06:00:00.000Z'))
  it('reads enclosure image', () => expect(items[0].imageUrl).toBe('https://t/a.jpg'))
  it('leaves publishedAt empty when missing', () => expect(items[1].publishedAt).toBe(''))
})

describe('parseFeed (Atom)', () => {
  const items = parseFeed(ATOM, feed)
  it('parses entry with href link', () => {
    expect(items[0]).toMatchObject({ title: 'Atom One', url: 'https://t/x', summary: 'Atom body' })
  })
})

describe('parseFeed (malformed)', () => {
  it('returns [] for non-xml', () => expect(parseFeed('garbage', feed)).toEqual([]))
})

describe('parseFeed (hnrss.org-style link aggregator)', () => {
  const HN_RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[How to sequence your own DNA at home]]></title>
<link>https://bradleywoolf.com/links-1/sequencing-my-own-dna-at-home</link>
<description><![CDATA[<p>Article URL: <a href="https://bradleywoolf.com/links-1/sequencing-my-own-dna-at-home">https://bradleywoolf.com/links-1/sequencing-my-own-dna-at-home</a></p><p>Comments URL: <a href="https://news.ycombinator.com/item?id=48812156">https://news.ycombinator.com/item?id=48812156</a></p><p>Points: 161</p><p># Comments: 52</p>]]></description>
<pubDate>Tue, 07 Jul 2026 00:14:21 GMT</pubDate></item>
</channel></rss>`

  it('strips the bookkeeping metadata out of the summary, leaving it empty', () => {
    const items = parseFeed(HN_RSS, feed)
    expect(items[0].title).toBe('How to sequence your own DNA at home')
    expect(items[0].summary).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { anchorToTitle, prepareScrapedSource, stripPriceTicker } from './tldr-source'

const TICKER_SAMPLE = `## Coin Prices

### [BTC](https://decrypt.co/price/bitcoin)

$63,274.00

0.53%

### [ETH](https://decrypt.co/price/ethereum)

$1,777.49

0.50%

### [BONK](https://decrypt.co/price/bonk)

$0.00000438

-8.41%

[Price data by](https://www.coingecko.com/)

* * *

Reading

Myriad | DASTAN

#### In brief

- BONK suffered a $20 million exploit related to a malicious governance attack.

Solana Meme Coin Bonk Treasury Drained of $20 Million in 'Malicious' Governance Attack

BonkDAO, the decentralized autonomous organization tied to the popular Bonk meme coin on Solana, fell victim to a "malicious" governance attack that resulted in a roughly $20 million heist from its treasury.`

describe('stripPriceTicker', () => {
  it('removes repeating ### [SYM](url) / $price / pct% blocks', () => {
    const out = stripPriceTicker(TICKER_SAMPLE)
    expect(out).not.toContain('[BTC]')
    expect(out).not.toContain('[ETH]')
    expect(out).not.toContain('[BONK]')
    expect(out).not.toContain('$63,274.00')
  })

  it('keeps the real article content intact', () => {
    const out = stripPriceTicker(TICKER_SAMPLE)
    expect(out).toContain('BonkDAO')
    expect(out).toContain('malicious')
  })

  it('is a no-op on content with no ticker blocks', () => {
    const plain = 'Just a plain article with no ticker widgets at all.'
    expect(stripPriceTicker(plain)).toBe(plain)
  })
})

describe('anchorToTitle', () => {
  it('slices content starting at the article title', () => {
    const title = "Solana Meme Coin Bonk Treasury Drained of $20 Million in 'Malicious' Governance Attack"
    const out = anchorToTitle(TICKER_SAMPLE, title)
    expect(out.startsWith('Solana Meme Coin Bonk Treasury Drained')).toBe(true)
  })

  it('falls back to a title prefix match when the full title is reformatted', () => {
    const content = 'noise noise noise\n\nsolana meme coin bonk treasury drained of twenty million and other differing details, real article body here'
    const title = "Solana Meme Coin Bonk Treasury Drained of $20 Million in 'Malicious' Governance Attack"
    const out = anchorToTitle(content, title)
    expect(out.startsWith('solana meme coin bonk treasury drained')).toBe(true)
  })

  it('returns content unchanged when the title cannot be located', () => {
    const content = 'completely unrelated scraped content'
    const title = 'Some Headline That Never Appears In The Body Text At All'
    expect(anchorToTitle(content, title)).toBe(content)
  })

  it('returns content unchanged for very short titles', () => {
    const content = 'some content'
    expect(anchorToTitle(content, 'Hi')).toBe(content)
  })
})

describe('prepareScrapedSource', () => {
  it('strips ticker, anchors to title, then truncates', () => {
    const title = "Solana Meme Coin Bonk Treasury Drained of $20 Million in 'Malicious' Governance Attack"
    const out = prepareScrapedSource(TICKER_SAMPLE, title, 500)
    expect(out).toContain('BonkDAO')
    expect(out).not.toContain('[BTC]')
    expect(out.length).toBeLessThanOrEqual(500)
  })
})

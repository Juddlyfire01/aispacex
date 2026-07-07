import { useState } from 'react'
import { venice } from '../../lib/venice-client'
import type { ChatCompletionResponse } from '../../types/venice'
import { Spinner } from '../ui/spinner'
import { prepareScrapedSource } from '../../lib/news/tldr-source'

const TLDR_MODEL = 'venice-uncensored-1-2'
const SCRAPE_MAX_CHARS = 6000

interface ScrapeResponse { url: string; content: string; format: string }

const cache = new Map<string, string>()

async function scrapeArticle(url: string, title: string): Promise<string | null> {
  try {
    const r = await venice<ScrapeResponse>('/augment/scrape', {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
    const content = (r.content ?? '').trim()
    if (content.length === 0) return null
    // Scraped pages (esp. crypto news sites) often prepend large boilerplate
    // widgets — price tickers, "recommended articles" teasers — before the
    // real article body. Strip that noise and anchor to the article's own
    // title before truncating, so the LLM actually sees the article.
    const prepared = prepareScrapedSource(content, title, SCRAPE_MAX_CHARS)
    return prepared.length > 0 ? prepared : null
  } catch {
    return null
  }
}

async function summarize(source: string, title: string): Promise<string> {
  const res = await venice<ChatCompletionResponse>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: TLDR_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You summarize news articles into 2-3 short bullet points. ' +
            'The user message contains the article title followed by scraped page content, which may include ' +
            'unrelated boilerplate (ads, price tickers, navigation, other article teasers). ' +
            'Summarize ONLY the article matching the given title — ignore any unrelated content. ' +
            'If the scraped content does not actually contain that article, output exactly: ' +
            '"- Summary unavailable: scraped content did not match the article." ' +
            'Output only the bullets, each starting with "- ". No preamble.',
        },
        { role: 'user', content: `Article title: ${title}\n\n${source}` },
      ],
      temperature: 0.3,
      max_tokens: 220,
    }),
  })
  return res.choices?.[0]?.message?.content?.trim() ?? ''
}

export function Tldr({ url, title, excerpt }: { url: string; title: string; excerpt: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>(
    cache.has(url) ? 'done' : 'idle',
  )
  const [text, setText] = useState(() => cache.get(url) ?? '')
  const [fromExcerpt, setFromExcerpt] = useState(false)

  async function run() {
    setState('loading')
    try {
      const scraped = await scrapeArticle(url, title)
      const usedExcerpt = scraped == null
      setFromExcerpt(usedExcerpt)
      const source = scraped ?? excerpt
      if (!source) { setState('error'); return }
      const summary = await summarize(source, title)
      if (!summary) { setState('error'); return }
      cache.set(url, summary)
      setText(summary)
      setState('done')
    } catch {
      setState('error')
    }
  }

  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={run}
        className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-[var(--color-border-soft)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/30 transition-colors"
      >
        TL;DR
      </button>
    )
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
        <Spinner size="xs" /> Summarizing…
      </div>
    )
  }

  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={run}
        className="text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
      >
        TL;DR unavailable — retry
      </button>
    )
  }

  return (
    <div className="w-full rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-bg-base)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)] mb-1">
        TL;DR{fromExcerpt ? ' (based on excerpt)' : ''}
      </div>
      <div className="text-[12px] leading-relaxed text-[var(--color-text-primary)] whitespace-pre-line">
        {text}
      </div>
    </div>
  )
}

/**
 * LIWC-ish style features over own-authored posts.
 * Deterministic; rates are per 100 tokens. Never injected raw into Compose —
 * they ground the register style sheet in report synthesis only.
 */

export interface StyleFeatures {
  avgSentenceLen: number
  sentenceLenCv: number
  iRate: number
  weRate: number
  youRate: number
  hedgeRate: number
  certaintyRate: number
  negAffectRate: number
  posAffectRate: number
  cognitiveRate: number
  quantRate: number
  questionRate: number
  exclaimRate: number
  linkRate: number
  avgPostChars: number
  /** Tokens counted across the corpus (denominator for rates). */
  tokenCount: number
  /** Own posts that contributed text. */
  postCount: number
}

const HEDGES = new Set([
  'maybe',
  'perhaps',
  'possibly',
  'probably',
  'sort',
  'kinda',
  'kind',
  'somewhat',
  'seems',
  'seem',
  'appears',
  'appear',
  'roughly',
  'around',
  'about',
  'ish',
  'guess',
  'suppose',
  'allegedly',
  'reportedly',
])

const CERTAINTY = new Set([
  'always',
  'never',
  'clearly',
  'definitely',
  'certainly',
  'obviously',
  'undeniably',
  'absolutely',
  'must',
  'will',
  'undoubtedly',
  'precisely',
  'exactly',
  'guaranteed',
])

const POS_AFFECT = new Set([
  'good',
  'great',
  'love',
  'loved',
  'amazing',
  'excellent',
  'happy',
  'glad',
  'win',
  'winning',
  'bullish',
  'strong',
  'best',
  'excited',
  'hope',
  'hopeful',
  'nice',
  'awesome',
  'solid',
])

const NEG_AFFECT = new Set([
  'bad',
  'hate',
  'hated',
  'terrible',
  'awful',
  'sad',
  'angry',
  'fear',
  'scared',
  'risk',
  'risky',
  'bearish',
  'weak',
  'worst',
  'fail',
  'failed',
  'failure',
  'crisis',
  'danger',
  'ugly',
  'stupid',
])

const COGNITIVE = new Set([
  'because',
  'think',
  'thinks',
  'thought',
  'know',
  'knows',
  'knew',
  'realize',
  'realizes',
  'realized',
  'believe',
  'believes',
  'understood',
  'understand',
  'reason',
  'why',
  'therefore',
  'thus',
  'hence',
  'consider',
  'considering',
  'analyze',
  'analysis',
])

const I_FORMS = new Set(['i', "i'm", "i've", "i'd", "i'll", 'me', 'my', 'mine', 'myself'])
const WE_FORMS = new Set(['we', "we're", "we've", "we'd", "we'll", 'us', 'our', 'ours', 'ourselves'])
const YOU_FORMS = new Set([
  'you',
  "you're",
  "you've",
  "you'd",
  "you'll",
  'your',
  'yours',
  'yourself',
  'yourselves',
  "y'all",
])

const URL_RE = /https?:\/\/\S+|www\.\S+/gi
const QUANT_RE = /\$[\d,.]+|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?[KkMm]\b|\b\d[\d,]*(?:\.\d+)?\b/g

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/** Strip URLs then split into rough word tokens. */
export function tokenize(text: string): string[] {
  const cleaned = text.replace(URL_RE, ' ')
  return cleaned
    .toLowerCase()
    .match(/[a-z0-9']+/g) ?? []
}

/** Split on . ? ! and newlines; keep non-empty trimmed clauses. */
export function splitSentences(text: string): string[] {
  const withoutUrls = text.replace(URL_RE, ' ')
  return withoutUrls
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function ratePer100(count: number, tokens: number): number {
  if (tokens <= 0) return 0
  return round((count / tokens) * 100)
}

function emptyFeatures(): StyleFeatures {
  return {
    avgSentenceLen: 0,
    sentenceLenCv: 0,
    iRate: 0,
    weRate: 0,
    youRate: 0,
    hedgeRate: 0,
    certaintyRate: 0,
    negAffectRate: 0,
    posAffectRate: 0,
    cognitiveRate: 0,
    quantRate: 0,
    questionRate: 0,
    exclaimRate: 0,
    linkRate: 0,
    avgPostChars: 0,
    tokenCount: 0,
    postCount: 0,
  }
}

/**
 * Compute style features from own-post texts. Pure.
 * @param texts post bodies (caller filters to own authored posts)
 */
export function computeStyleFeatures(texts: string[]): StyleFeatures {
  const usable = texts.map((t) => t.trim()).filter(Boolean)
  if (usable.length === 0) return emptyFeatures()

  let tokenCount = 0
  let iCount = 0
  let weCount = 0
  let youCount = 0
  let hedgeCount = 0
  let certaintyCount = 0
  let negCount = 0
  let posCount = 0
  let cognitiveCount = 0
  let quantCount = 0
  let questionCount = 0
  let exclaimCount = 0
  let linkCount = 0
  let charSum = 0
  const sentenceLens: number[] = []

  for (const text of usable) {
    charSum += text.length
    const urls = text.match(URL_RE)
    linkCount += urls?.length ?? 0
    questionCount += (text.match(/\?/g) ?? []).length
    exclaimCount += (text.match(/!/g) ?? []).length
    const quants = text.match(QUANT_RE)
    quantCount += quants?.length ?? 0

    const tokens = tokenize(text)
    tokenCount += tokens.length
    for (const tok of tokens) {
      if (I_FORMS.has(tok)) iCount++
      if (WE_FORMS.has(tok)) weCount++
      if (YOU_FORMS.has(tok)) youCount++
      if (HEDGES.has(tok)) hedgeCount++
      if (CERTAINTY.has(tok)) certaintyCount++
      if (NEG_AFFECT.has(tok)) negCount++
      if (POS_AFFECT.has(tok)) posCount++
      if (COGNITIVE.has(tok)) cognitiveCount++
      // "sort of" / "kind of" — count the second word when paired
      // (already counted sort/kind as hedge; acceptable for LIWC-ish)
    }

    for (const sent of splitSentences(text)) {
      const len = tokenize(sent).length
      if (len > 0) sentenceLens.push(len)
    }
  }

  const avgSentenceLen =
    sentenceLens.length > 0
      ? round(sentenceLens.reduce((a, b) => a + b, 0) / sentenceLens.length)
      : 0
  let sentenceLenCv = 0
  if (sentenceLens.length >= 2 && avgSentenceLen > 0) {
    const mean = sentenceLens.reduce((a, b) => a + b, 0) / sentenceLens.length
    const variance =
      sentenceLens.reduce((a, len) => a + (len - mean) ** 2, 0) / sentenceLens.length
    sentenceLenCv = round(Math.sqrt(variance) / mean)
  }

  return {
    avgSentenceLen,
    sentenceLenCv,
    iRate: ratePer100(iCount, tokenCount),
    weRate: ratePer100(weCount, tokenCount),
    youRate: ratePer100(youCount, tokenCount),
    hedgeRate: ratePer100(hedgeCount, tokenCount),
    certaintyRate: ratePer100(certaintyCount, tokenCount),
    negAffectRate: ratePer100(negCount, tokenCount),
    posAffectRate: ratePer100(posCount, tokenCount),
    cognitiveRate: ratePer100(cognitiveCount, tokenCount),
    quantRate: ratePer100(quantCount, tokenCount),
    questionRate: ratePer100(questionCount, tokenCount),
    exclaimRate: ratePer100(exclaimCount, tokenCount),
    linkRate: ratePer100(linkCount, tokenCount),
    avgPostChars: round(charSum / usable.length, 1),
    tokenCount,
    postCount: usable.length,
  }
}

export type PostFormatLabel = 'post' | 'longform' | 'article'

export interface StyleFeaturesReport {
  overall: StyleFeatures
  byFormat: Record<PostFormatLabel, StyleFeatures>
  formatCounts: Record<PostFormatLabel, number>
}

export function postFormatOf(p: { format?: PostFormatLabel }): PostFormatLabel {
  return p.format ?? 'post'
}

/** Compute overall + per-format style sheets from own posts. */
export function computeStyleFeaturesReport(
  posts: { text?: string; format?: PostFormatLabel }[],
): StyleFeaturesReport {
  const buckets: Record<PostFormatLabel, string[]> = {
    post: [],
    longform: [],
    article: [],
  }
  for (const p of posts) {
    const text = p.text?.trim()
    if (!text) continue
    buckets[postFormatOf(p)].push(text)
  }
  const all = [...buckets.post, ...buckets.longform, ...buckets.article]
  return {
    overall: computeStyleFeatures(all),
    byFormat: {
      post: computeStyleFeatures(buckets.post),
      longform: computeStyleFeatures(buckets.longform),
      article: computeStyleFeatures(buckets.article),
    },
    formatCounts: {
      post: buckets.post.length,
      longform: buckets.longform.length,
      article: buckets.article.length,
    },
  }
}

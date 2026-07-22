import { venice } from '../venice-client'
import { parseSSEStream } from '../stream'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import { fetchModelsBundle } from '../venice-model-utils'
import type { VeniceModel } from '../../types/venice'
import { partitionPosts } from './activity'
import { estimateMessagesTokens, estimateTextTokens } from './token-estimate'
import { expectedOutForCall, priorTokenHintFromSnapshot } from './report-progress'
import type {
  Profile,
  Post,
  CharacterProfile,
  SynthesisSettings,
  ReportAnalytics,
  ReportNarrative,
  ChangeSummary,
  IntelReportSnapshot,
  RegisterSections,
} from './types'
import type { ChatCompletionResponse } from '../../types/venice'
import { EMPTY_SECTIONS } from '../compose/register'
import { packPostsForContext, formatTranscriptLine } from './context-pack'

let textModelsCache: VeniceModel[] | null = null

async function resolveTextModel(modelId: string): Promise<VeniceModel | undefined> {
  if (!textModelsCache) {
    try {
      textModelsCache = (await fetchModelsBundle('text')).models
    } catch {
      return undefined
    }
  }
  return textModelsCache.find((m) => m.id === modelId)
}

/**
 * Defensively extract a JSON object from an LLM response. Tries, in order:
 * the fenced ```json block, the whole trimmed content, then a scan from each
 * '{' for the first substring that parses. Returns null if nothing parses.
 * Shared by parseSynthesis and parseReport.
 */
export function extractJson(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates = [fenced?.[1], content].filter((c): c is string => Boolean(c))
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim())
    } catch {
      // try next candidate
    }
  }
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '{') continue
    try {
      return JSON.parse(content.slice(i))
    } catch {
      // try next '{'
    }
  }
  return null
}

const SYNTHESIS_SYSTEM = `You are an intelligence analyst. Given a target's recent posts and profile, produce a structured character profile. Be specific and evidence-grounded. Cite post content. No fluff. No speculation beyond the given data.

Respond with ONLY a fenced json block matching exactly this shape:
\`\`\`json
{
  "themes": ["string"],
  "register": "string — tone/style description",
  "recurringTopics": [{ "topic": "string", "postCount": 0, "lastSeen": "ISO date" }],
  "postingCadence": { "pattern": "burst|steady", "peakWindowsUtc": ["HH:MM-HH:MM"], "avgPerDay": 0, "variance": "high|medium|low" },
  "flagshipPost": { "postId": "id of highest-engagement post", "excerpt": "first ~100 chars", "metrics": { "impressions": 0, "likes": 0, "reposts": 0, "replies": 0, "quotes": 0, "bookmarks": 0 } }
}
\`\`\``

export function parseSynthesis(content: string, model: string): CharacterProfile {
  const raw = extractJson(content)
  if (!raw) {
    throw new Error('Could not parse synthesis response — model did not return valid JSON')
  }

  const r = raw as {
    themes?: string[]
    register?: string
    recurringTopics?: CharacterProfile['recurringTopics']
    postingCadence?: CharacterProfile['postingCadence']
    flagshipPost?: CharacterProfile['flagshipPost']
  }

  if (!r.postingCadence || !r.flagshipPost) {
    throw new Error('Could not parse synthesis response — missing required fields')
  }

  return {
    themes: r.themes ?? [],
    register: r.register ?? '',
    recurringTopics: r.recurringTopics ?? [],
    postingCadence: r.postingCadence,
    flagshipPost: r.flagshipPost,
    synthesizedAt: new Date().toISOString(),
    model,
  }
}

export async function synthesizeProfile(
  profile: Profile,
  posts: Post[],
  settings: SynthesisSettings,
): Promise<CharacterProfile> {
  const transcript = packPostsForContext(posts, settings.contextCap).map(formatTranscriptLine).join('\n')

  const resp = await venice<ChatCompletionResponse>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      temperature: settings.temperature,
      messages: [
        { role: 'system', content: SYNTHESIS_SYSTEM },
        { role: 'user', content: `Profile: ${JSON.stringify(profile)}\n\nPosts:\n${transcript}` },
      ],
    }),
  })

  const choice = resp.choices?.[0]
  if (!choice?.message?.content) {
    throw new Error('Venice synthesis returned no content — the model may have refused or filtered the request')
  }
  return parseSynthesis(choice.message.content, settings.model)
}

// ——— Comprehensive Report (analytics-grounded) ———

const REPORT_SYSTEM = `You are a senior intelligence analyst producing a structured dossier on a social-media target. You are given (1) the target's profile, (2) a COMPUTED ANALYTICS object of exact, pre-calculated facts and figures, and (3) a transcript of the target's OWN posts (not inbound mentions from others).

CRITICAL RULES:
- The COMPUTED ANALYTICS are ground truth. They cover only the target's authored posts — inbound mentions others wrote at/about the target are excluded from posting cadence, composition, and engagement metrics.
- Cite the analytics in plain language. NEVER recompute, contradict, or invent numbers — if you state a figure, it must come from the analytics object.
- Never paste raw analytics field names, camelCase keys, snake_case keys, or key=value / (field=n) citations into prose. Translate figures into reader-facing wording (e.g. "engagement rate 4.2%", "averages 3.1 posts per day"). JSON keys are for you to read — not to quote.
- Be specific and evidence-grounded. Reference real posts by their id.
- For themes and narrativeArcs, cite EVERY post that supports the point — list all relevant post ids, not just one. Include as many as genuinely apply (some themes will have one, others several); never artificially limit the count.
- No speculation beyond what the data supports. Distinguish observation from inference.
- For notablePosts, return only the post id and why it matters — do not fabricate post text.
- COMPUTED STYLE FEATURES (analytics.styleFeatures) inform the register.
  - Use overall + byFormat. Prefer byFormat.post for short-form cadence; byFormat.article / byFormat.longform when those formatCounts are > 0.
  - NEVER paste averages, character counts, word counts, or per-100-token rates into register prose.
- Fill register as an ABSTRACT style sheet for drafting (how they write), NOT a psychological profile and NOT a quote bank.
- REGISTER EXTRACTION RULES (critical — creative freedom):
  - Pure extraction of habits: rhythm class, diction class, stance, rhetorical moves, texture preferences, format flex, anti-patterns.
  - FORBIDDEN in every register field: quoted post text, paraphrased one-liners, sample sentences, amplified-quote recipes, product names as exemplars, slogan fragments, concrete exhibits from the transcript.
  - FORBIDDEN: hard length quotas ("under 10 words", "~170 characters"). Describe relative tendencies only.
  - devices must be ABSTRACT rhetorical moves (contrast_frame, tension_pivot, numbered_howto, soft_cta, ranking_stack) — never topic labels (privacy_pitch, token_math, quote_amplify).
  - Each section should be DEEP: 2–5 sentences of actionable guidance.
  - formatFlex is required. When the transcript includes lines tagged (article/…) or (longform/…), ground formatFlex in those observed samples (still abstract — no quotes). When formatCounts.article is 0, say article flex is inferred from short-form habits only.
  - constraints = voice anti-patterns only (not format bans).
- Transcript lines are tagged as (post|longform|article)/(kind, …). Articles were priority-packed into this window — treat them as the primary evidence for long-form voice when present.
- If postCount is very low, keep the style sheet cautious rather than overconfident.
- Prose string fields may use light Markdown (bold, italics, lists) but must NOT begin with a label like "markdown:" — write the actual content directly.
- The shape below is a schema. Replace every placeholder with real content; do not echo placeholder words like "string" or "markdown".

Respond with ONLY a fenced json block matching exactly this shape:
\`\`\`json
{
  "executiveSummary": "2-4 sentences on who this account is and its current posture",
  "strategicAssessment": "a paragraph on what this account appears to be trying to accomplish",
  "themes": [{ "name": "theme name", "evidence": "short reason plus every supporting post id (e.g. post:123, post:456, …) — cite all that apply, not just one", "weight": 0.0 }],
  "register": {
    "summary": "2-3 sentence abstract voice summary — no quotes, no product exhibits, no length quotas",
    "sections": {
      "cadence": "2-5 sentences: rhythm / punctuation / punch-vs-sprawl tendencies WITHOUT character or word-count caps",
      "diction": "2-5 sentences: word-choice class and register mixing — name CATEGORIES of lexicon, not slogan fragments to reuse",
      "stance": "2-5 sentences: certainty, hedging, agency, address (I/we/you) as habits",
      "rhetoric": "2-5 sentences: abstract moves available (tension, contrast, ranking, howto, CTA) with no sample lines",
      "texture": "2-5 sentences: when metrics/receipts/lists appear as texture — qualitative, not quotas",
      "formatFlex": "2-5 sentences: how this voice scales for post vs thread vs article/long-form (same identity, different length/paragraphing)",
      "constraints": "2-5 sentences: anti-patterns of the voice (not format bans)"
    },
    "devices": ["abstract_rhetorical_tag"]
  },
  "narrativeArcs": [{ "arc": "arc description", "trend": "rising|falling|stable", "evidence": "supporting detail plus every relevant post id (e.g. post:123, post:456, …)" }],
  "audienceRead": "who this content targets and why",
  "contradictions": ["notable tension or pivot"],
  "notablePosts": [{ "postId": "id", "why": "why it matters" }],
  "engagementHooks": ["angle for reciprocation/engagement"],
  "analystConclusions": ["the so-what: strategic assessment / predicted trajectory"]
}
\`\`\``

const CHANGE_SYSTEM = `You are a senior intelligence analyst writing the "what changed since the last report" section. You are given the previous report's narrative, and a COMPUTED DELTA object of exact changes.

CRITICAL RULES:
- The COMPUTED DELTA is ground truth. Cite its figures in plain language. Never invent numbers.
- Write for a human reader. Use everyday metric names only: "posts per day", "engagement rate", "amplification rate", "average likes", "average impressions", "own posts", "inbound mentions".
- FORBIDDEN in the narrative: camelCase or snake_case identifiers, key=value dumps, or parenthetical schema citations. Never write avgPerDay, engagementRate, amplificationRate, avgLikes, avgImpressions, volumeAddedOwn, volumeAddedInbound, bookmarkRate, dateRangeAdded, or similar.
- BAD: "avgPerDay 3.48 → 3.33" / "engagementRate unchanged at 0.0244" / "(volumeAddedOwn=2)"
- GOOD: "posts per day eased from 3.48 to 3.33" / "engagement rate held at 0.0244" / "2 own posts"
- Own authored additions = new posts the TARGET wrote. Inbound additions = new mentions OF the target gathered from others. Only own authored volume counts as the target "posting more" — never attribute inbound mention volume to the target's posting behavior.
- CRITICAL — backfill vs. real new attention: the inbound "mentions added" total is split into (a) mentions genuinely new this interval and (b) older mentions that are backfill. Backfill = historical mentions the gatherer only now captured; they are NOT attention the account received since the last report. Base any statement about the account "receiving more attention" ONLY on the genuinely-new-this-interval count. If most inbound additions are backfill, say the added mentions are mostly older mentions now captured (a data-coverage/backfill effect), NOT a surge in attention.
- Do NOT use amplifying qualifiers like "far more", "surge", or "spike" for inbound attention unless the genuinely-new-this-interval count actually supports it. A large total that is mostly backfill does not justify such language.
- When genuinely-new inbound additions dominate own authored additions, say the target received more inbound attention/mentions, not that they posted more.
- Posting velocity / average posts-per-day shifts reflect authored posts only.
- Distinguish clocks clearly: date ranges on newly added posts are the span of those posts' timestamps, not necessarily the wall-clock gap between report runs. A wide inbound date span (e.g. several months) across additions that are mostly backfill is a sign of historical capture, not of attention received in a short inter-report interval — never conflate the two.
- Interpret what the shifts mean for the target's strategy/posture. Be concise and concrete.
- The narrative may use light Markdown but must NOT begin with a label like "markdown:" — write the actual content directly.

Respond with ONLY a fenced json block matching exactly this shape:
\`\`\`json
{ "narrative": "2-5 sentences interpreting what changed and what it likely means" }
\`\`\``

function buildTranscript(posts: Post[], cap: number): string {
  return packPostsForContext(posts, cap).map(formatTranscriptLine).join('\n')
}

/**
 * Condense a prior report into narrative-only context for a follow-up synthesis.
 * We include the interpretive prose (summary, themes, arcs, conclusions) but NOT
 * the computed analytics numbers — the current run recomputes its own analytics,
 * and echoing stale figures risks the model quoting outdated numbers.
 */
export function condensePriorReport(snapshot: IntelReportSnapshot): string {
  const n = snapshot.narrative
  const themes = n.themes.map((t) => t.name).filter(Boolean).join(', ')
  const arcs = n.narrativeArcs.map((a) => `${a.arc} (${a.trend})`).join('; ')
  const lines = [
    `— Report ${new Date(snapshot.createdAt).toISOString().slice(0, 10)} (${snapshot.meta.postCount} posts) —`,
    n.executiveSummary && `Summary: ${n.executiveSummary}`,
    n.strategicAssessment && `Assessment: ${n.strategicAssessment}`,
    themes && `Themes: ${themes}`,
    arcs && `Arcs: ${arcs}`,
    n.analystConclusions.length > 0 && `Conclusions: ${n.analystConclusions.join(' | ')}`,
  ].filter(Boolean)
  return lines.join('\n')
}

export interface ReportMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * Build the exact chat messages sent for the MAIN report synthesis call. Shared
 * between the live payload estimator (synthesis settings UI) and the real call
 * in synthesizeReport, so the pre-send estimate reflects what actually ships.
 *
 * The change-summary call is a separate, smaller call and is intentionally not
 * modeled here — the live estimate covers the dominant main-call payload.
 */
export function buildReportMessages(args: {
  profile: Profile
  ownPosts: Post[]
  analytics: ReportAnalytics
  inboundCount: number
  includedReports: IntelReportSnapshot[]
  settings: SynthesisSettings
}): ReportMessage[] {
  const { profile, ownPosts, analytics, inboundCount, includedReports, settings } = args
  const transcript = buildTranscript(ownPosts, settings.contextCap)
  const priorContext = includedReports.length > 0
    ? `\n\nPRIOR ANALYSIS (narrative context from ${includedReports.length} earlier report${includedReports.length === 1 ? '' : 's'} — build on this; note continuity and shifts, do not simply repeat it):\n${includedReports.map(condensePriorReport).join('\n\n')}`
    : ''
  const fc = analytics.styleFeatures?.formatCounts
  const formatNote = fc
    ? `\n\nFORMAT COUNTS (ground truth for register.formatFlex): post=${fc.post}, longform=${fc.longform}, article=${fc.article}. If article>0, transcript lines tagged (article/…) are the observed long-form samples — do NOT claim no articles exist.`
    : ''
  return [
    { role: 'system', content: REPORT_SYSTEM },
    {
      role: 'user',
      content: `Profile: ${JSON.stringify(profile)}\n\nCOMPUTED ANALYTICS (ground truth — own posts only; ${inboundCount} inbound mentions excluded from metrics):\n${JSON.stringify(analytics)}${priorContext}${formatNote}\n\nTarget's own posts:\n${transcript}`,
    },
  ]
}

const STRING_ARRAY = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(stripMarkdownLabel) : [])

/**
 * Strip a leaked leading "markdown:" (or "md:") label that models sometimes echo
 * from a schema placeholder into the actual value, then replace any leaked
 * analytics/delta schema identifiers with plain-language labels.
 */
export function stripMarkdownLabel(s: string): string {
  if (typeof s !== 'string') return s
  return sanitizeSchemaFieldNames(s.replace(/^\s*(?:markdown|md)\s*:\s*/i, ''))
}

/** camelCase / schema keys the model must never show in reader-facing prose. */
export const SCHEMA_FIELD_LABELS: Record<string, string> = {
  volumeAddedOwn: 'own posts',
  volumeAddedInbound: 'inbound mentions',
  volumeAdded: 'added volume',
  dateRangeAddedOwn: 'own-post window',
  dateRangeAddedInbound: 'inbound window',
  dateRangeAdded: 'added-post window',
  avgPerDay: 'posts per day',
  engagementRate: 'engagement rate',
  bookmarkRate: 'bookmark rate',
  amplificationRate: 'amplification rate',
  avgLikes: 'average likes',
  avgImpressions: 'average impressions',
  followers: 'followers',
  metricShifts: 'metric shifts',
  compositionDrift: 'composition drift',
  cadenceDrift: 'cadence drift',
  emergingTopics: 'emerging topics',
  fadingTopics: 'fading topics',
  sustainedTopics: 'sustained topics',
  networkChanges: 'network changes',
  deltaPct: 'percent change',
  postIdsAnalyzed: 'posts analyzed',
}

/** Reader-facing label for a metric/delta schema key. */
export function labelForSchemaField(key: string): string {
  return SCHEMA_FIELD_LABELS[key] ?? key
}

const SCHEMA_FIELD_KEYS = Object.keys(SCHEMA_FIELD_LABELS).sort((a, b) => b.length - a.length)

/**
 * Replace leaked schema identifiers with plain-language labels. Targeted to
 * known analytics/delta keys — not a broad camelCase scrub — so real prose stays intact.
 */
export function sanitizeSchemaFieldNames(s: string): string {
  if (typeof s !== 'string' || !s) return s
  let out = s
  // (volumeAddedOwn=2) / (avgPerDay=3.3) style dumps
  out = out.replace(
    /\(\s*(?:volumeAdded(?:Own|Inbound)?|dateRangeAdded(?:Own|Inbound)?|avgPerDay|engagementRate|bookmarkRate|amplificationRate|avgLikes|avgImpressions|deltaPct)\s*=\s*[^)]*\)/g,
    '',
  )
  for (const key of SCHEMA_FIELD_KEYS) {
    out = out.replace(new RegExp(`\\b${key}\\b`, 'g'), SCHEMA_FIELD_LABELS[key]!)
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ \)/g, ')').trim()
}

/** Plain-language COMPUTED DELTA for the change-summary call — no camelCase keys to echo. */
export function humanizeComputedDelta(
  delta: Omit<ChangeSummary, 'narrative'>,
): Record<string, unknown> {
  return {
    'own posts added': delta.volumeAddedOwn,
    'inbound mentions added (total newly gathered)': delta.volumeAddedInbound,
    'inbound mentions that are genuinely new this interval': delta.volumeAddedInboundInInterval,
    'inbound mentions that are older backfill (not new attention)': delta.volumeAddedInboundBackfilled,
    'total rows added': delta.volumeAdded,
    'date range of added posts': delta.dateRangeAdded,
    'date range of own posts added': delta.dateRangeAddedOwn,
    'date range of inbound mentions added': delta.dateRangeAddedInbound,
    'date range of genuinely new inbound mentions': delta.dateRangeAddedInboundInInterval,
    'date range of backfilled inbound mentions': delta.dateRangeAddedInboundBackfilled,
    'metric shifts': delta.metricShifts.map((s) => ({
      metric: SCHEMA_FIELD_LABELS[s.metric] ?? s.metric,
      from: s.from,
      to: s.to,
      'percent change': s.deltaPct,
    })),
    'composition drift': delta.compositionDrift,
    'cadence drift': delta.cadenceDrift,
    'emerging topics': delta.emergingTopics,
    'fading topics': delta.fadingTopics,
    'sustained topics': delta.sustainedTopics,
    'network changes': delta.networkChanges,
  }
}

function parseRegisterSections(raw: unknown): RegisterSections {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: RegisterSections = { ...EMPTY_SECTIONS }
  for (const key of Object.keys(EMPTY_SECTIONS) as (keyof RegisterSections)[]) {
    const v = o[key]
    out[key] = typeof v === 'string' ? v : ''
  }
  return out
}

function parseRegister(raw: unknown): ReportNarrative['register'] {
  if (!raw || typeof raw !== 'object') {
    return { summary: '', sections: { ...EMPTY_SECTIONS }, devices: [] }
  }
  const o = raw as {
    summary?: string
    description?: string
    devices?: string[]
    sections?: unknown
  }
  const summary =
    typeof o.summary === 'string' && o.summary.trim()
      ? o.summary
      : typeof o.description === 'string'
        ? o.description
        : ''
  return {
    summary,
    sections: parseRegisterSections(o.sections),
    devices: Array.isArray(o.devices) ? o.devices.filter((d): d is string => typeof d === 'string') : [],
  }
}

export function parseReport(content: string): ReportNarrative {
  const raw = extractJson(content)
  if (!raw) throw new Error('Could not parse report response — model did not return valid JSON')
  const r = raw as Partial<ReportNarrative>
  if (!r.executiveSummary && !r.strategicAssessment) {
    throw new Error('Could not parse report response — missing required narrative fields')
  }
  return {
    executiveSummary: stripMarkdownLabel(r.executiveSummary ?? ''),
    strategicAssessment: stripMarkdownLabel(r.strategicAssessment ?? ''),
    themes: Array.isArray(r.themes) ? r.themes : [],
    register: parseRegister(r.register),
    narrativeArcs: Array.isArray(r.narrativeArcs) ? r.narrativeArcs : [],
    audienceRead: stripMarkdownLabel(r.audienceRead ?? ''),
    contradictions: STRING_ARRAY(r.contradictions),
    notablePosts: Array.isArray(r.notablePosts) ? r.notablePosts : [],
    engagementHooks: STRING_ARRAY(r.engagementHooks),
    analystConclusions: STRING_ARRAY(r.analystConclusions),
  }
}

export interface SynthesizeReportResult {
  narrative: ReportNarrative
  changeNarrative: string | null
  /** Exact total tokens (prompt + completion) across all calls, from Venice. */
  tokenCost: number
  /** Exact prompt tokens summed across all calls. */
  promptTokens: number
  /** Exact completion tokens summed across all calls. */
  completionTokens: number
}

export type SynthesizePhase = 'narrative' | 'change'

export interface SynthesizeStreamProgress {
  phase: SynthesizePhase
  /** Estimated completion tokens received so far (from streamed text). */
  receivedTokens: number
  /** Ballpark expected completion tokens for this call. */
  expectedTokens: number
}

export interface SynthesizeReportOptions {
  /** Fired immediately before each Venice call so UI can advance progress. */
  onPhase?: (phase: SynthesizePhase) => void
  /** Fired as streamed tokens arrive (throttled by the caller if needed). */
  onStreamProgress?: (p: SynthesizeStreamProgress) => void
}

interface StreamedCompletion {
  content: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

/**
 * Stream a chat completion and accumulate content. Prefers final-chunk usage
 * when the provider sends it; otherwise falls back to char-based estimates.
 */
async function streamChatCompletion(
  body: Record<string, unknown>,
  onDelta?: (contentSoFar: string) => void,
): Promise<StreamedCompletion> {
  const stream = await venice<ReadableStream<Uint8Array>>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      ...body,
      stream: true,
      // OpenAI-compatible; ignored harmlessly if unsupported.
      stream_options: { include_usage: true },
    }),
    stream: true,
  })

  let content = ''
  let usage: StreamedCompletion['usage']
  for await (const chunk of parseSSEStream(stream)) {
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) {
      content += delta
      onDelta?.(content)
    }
    if (chunk.usage) usage = chunk.usage
  }
  return { content, usage }
}

/**
 * Produce the LLM portion of a report: the narrative interpretation grounded in
 * the (already-computed) analytics, and — when a computed delta is supplied —
 * a change-summary narrative grounded in that delta. Returns the total token
 * cost across both calls for the snapshot's meta.
 *
 * @param computedDelta the deterministic delta (without narrative); null for baseline
 * @param includedReports prior report snapshots to feed in as narrative context (may be empty)
 */
export async function synthesizeReport(
  profile: Profile,
  posts: Post[],
  analytics: ReportAnalytics,
  computedDelta: Omit<ChangeSummary, 'narrative'> | null,
  prevSnapshot: IntelReportSnapshot | null,
  settings: SynthesisSettings,
  includedReports: IntelReportSnapshot[] = [],
  options: SynthesizeReportOptions = {},
): Promise<SynthesizeReportResult> {
  const { own } = partitionPosts(profile, posts)
  const inboundCount = posts.length - own.length

  const reportMessages = buildReportMessages({
    profile, ownPosts: own, analytics, inboundCount, includedReports, settings,
  })
  const estimatedPrompt = estimateMessagesTokens(reportMessages)
  const priorHint = priorTokenHintFromSnapshot(prevSnapshot?.meta)
  const priorIncludedChange = Boolean(prevSnapshot?.changeSummary)
  const hasChangeStep = Boolean(computedDelta && prevSnapshot)

  options.onPhase?.('narrative')
  const expectedNarrativeOut = expectedOutForCall(
    'narrative', estimatedPrompt, priorHint, priorIncludedChange || hasChangeStep,
  )
  options.onStreamProgress?.({
    phase: 'narrative',
    receivedTokens: 0,
    expectedTokens: expectedNarrativeOut,
  })

  let lastEmit = 0
  const narrativeStream = await streamChatCompletion(
    {
      model: settings.model,
      temperature: settings.temperature,
      messages: reportMessages,
    },
    (soFar) => {
      const received = estimateTextTokens(soFar)
      // Throttle UI updates (~every ~40 tokens of estimated growth)
      if (received - lastEmit < 40 && received < expectedNarrativeOut * 0.95) return
      lastEmit = received
      options.onStreamProgress?.({
        phase: 'narrative',
        receivedTokens: received,
        expectedTokens: expectedNarrativeOut,
      })
    },
  )
  if (!narrativeStream.content.trim()) {
    throw new Error('Venice report synthesis returned no content — the model may have refused or filtered the request')
  }
  const narrative = parseReport(narrativeStream.content)

  const narrPrompt = narrativeStream.usage?.prompt_tokens ?? estimatedPrompt
  const narrCompletion = narrativeStream.usage?.completion_tokens ?? estimateTextTokens(narrativeStream.content)
  const narrTotal = narrativeStream.usage?.total_tokens ?? (narrPrompt + narrCompletion)
  let tokenCost = narrTotal
  let promptTokens = narrPrompt
  let completionTokens = narrCompletion
  const modelSpec = await resolveTextModel(settings.model)
  const reportAction = `report:${profile.username}`
  useVeniceCostStore.getState().addUsage(modelSpec, {
    prompt_tokens: narrPrompt,
    completion_tokens: narrCompletion,
    total_tokens: narrTotal,
  }, { action: reportAction, kind: 'text', meta: { phase: 'narrative' } })

  let changeNarrative: string | null = null
  if (computedDelta && prevSnapshot) {
    const changeMessages = [
      { role: 'system', content: CHANGE_SYSTEM },
      {
        role: 'user',
        content: `Previous report narrative:\n${JSON.stringify(prevSnapshot.narrative)}\n\nCOMPUTED DELTA (ground truth):\n${JSON.stringify(humanizeComputedDelta(computedDelta))}`,
      },
    ]
    const changePromptEst = estimateMessagesTokens(changeMessages)
    const expectedChangeOut = expectedOutForCall(
      'change', changePromptEst, priorHint, true,
    )

    options.onPhase?.('change')
    lastEmit = 0
    options.onStreamProgress?.({
      phase: 'change',
      receivedTokens: 0,
      expectedTokens: expectedChangeOut,
    })

    const changeStream = await streamChatCompletion(
      {
        model: settings.model,
        temperature: settings.temperature,
        messages: changeMessages,
      },
      (soFar) => {
        const received = estimateTextTokens(soFar)
        if (received - lastEmit < 25 && received < expectedChangeOut * 0.95) return
        lastEmit = received
        options.onStreamProgress?.({
          phase: 'change',
          receivedTokens: received,
          expectedTokens: expectedChangeOut,
        })
      },
    )

    const chPrompt = changeStream.usage?.prompt_tokens ?? changePromptEst
    const chCompletion = changeStream.usage?.completion_tokens ?? estimateTextTokens(changeStream.content)
    const chTotal = changeStream.usage?.total_tokens ?? (chPrompt + chCompletion)
    tokenCost += chTotal
    promptTokens += chPrompt
    completionTokens += chCompletion
    useVeniceCostStore.getState().addUsage(modelSpec, {
      prompt_tokens: chPrompt,
      completion_tokens: chCompletion,
      total_tokens: chTotal,
    }, { action: reportAction, kind: 'text', meta: { phase: 'change' } })

    if (changeStream.content.trim()) {
      const parsed = extractJson(changeStream.content) as { narrative?: string } | null
      changeNarrative = stripMarkdownLabel(parsed?.narrative ?? '')
    } else {
      changeNarrative = ''
    }
  }

  return { narrative, changeNarrative, tokenCost, promptTokens, completionTokens }
}


import { venice } from '../venice-client'
import { partitionPosts } from './activity'
import type {
  Profile,
  Post,
  CharacterProfile,
  SynthesisSettings,
  ReportAnalytics,
  ReportNarrative,
  ChangeSummary,
  IntelReportSnapshot,
} from './types'
import type { ChatCompletionResponse } from '../../types/venice'

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
  const transcript = posts
    .slice(0, settings.contextCap)
    .map((p) => `[${p.createdAt}] (${p.kind}, ${p.metrics.likes}L/${p.metrics.reposts}R, id:${p.id}) ${p.text}`)
    .join('\n')

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
- Cite the analytics. NEVER recompute, contradict, or invent numbers — if you state a figure, it must come from the analytics object.
- Be specific and evidence-grounded. Reference real posts by their id.
- No speculation beyond what the data supports. Distinguish observation from inference.
- For notablePosts, return only the post id and why it matters — do not fabricate post text.
- Prose string fields may use light Markdown (bold, italics, lists) but must NOT begin with a label like "markdown:" — write the actual content directly.
- The shape below is a schema. Replace every placeholder with real content; do not echo placeholder words like "string" or "markdown".

Respond with ONLY a fenced json block matching exactly this shape:
\`\`\`json
{
  "executiveSummary": "2-4 sentences on who this account is and its current posture",
  "strategicAssessment": "a paragraph on what this account appears to be trying to accomplish",
  "themes": [{ "name": "theme name", "evidence": "cited post excerpt or id", "weight": 0.0 }],
  "register": { "description": "tone/style", "devices": ["rhetorical device"] },
  "narrativeArcs": [{ "arc": "arc description", "trend": "rising|falling|stable", "evidence": "supporting detail" }],
  "audienceRead": "who this content targets and why",
  "contradictions": ["notable tension or pivot"],
  "notablePosts": [{ "postId": "id", "why": "why it matters" }],
  "engagementHooks": ["angle for reciprocation/engagement"],
  "analystConclusions": ["the so-what: strategic assessment / predicted trajectory"]
}
\`\`\``

const CHANGE_SYSTEM = `You are a senior intelligence analyst writing the "what changed since the last report" section. You are given the previous report's narrative, and a COMPUTED DELTA object of exact changes.

CRITICAL RULES:
- The COMPUTED DELTA is ground truth. Cite its figures. Never invent numbers.
- volumeAddedOwn = new posts the TARGET authored. volumeAddedInbound = new mentions OF the target gathered from others. Only volumeAddedOwn counts as the target "posting more" — never attribute inbound mention volume to the target's posting behavior.
- When volumeAddedInbound dominates volumeAddedOwn, say the target received more inbound attention/mentions, not that they posted more.
- Posting velocity / avgPerDay shifts reflect authored posts only.
- Interpret what the shifts mean for the target's strategy/posture. Be concise and concrete.
- The narrative may use light Markdown but must NOT begin with a label like "markdown:" — write the actual content directly.

Respond with ONLY a fenced json block matching exactly this shape:
\`\`\`json
{ "narrative": "2-5 sentences interpreting what changed and what it likely means" }
\`\`\``

function buildTranscript(posts: Post[], cap: number): string {
  return posts
    .slice(0, cap)
    .map((p) => `[${p.createdAt}] (${p.kind}, ${p.metrics.likes}L/${p.metrics.reposts}R/${p.metrics.bookmarks}B, id:${p.id}) ${p.text}`)
    .join('\n')
}

const STRING_ARRAY = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(stripMarkdownLabel) : [])

/**
 * Strip a leaked leading "markdown:" (or "md:") label that models sometimes echo
 * from a schema placeholder into the actual value. Defensive: applied to all
 * prose fields so stray labels never render, regardless of the prompt.
 */
export function stripMarkdownLabel(s: string): string {
  if (typeof s !== 'string') return s
  return s.replace(/^\s*(?:markdown|md)\s*:\s*/i, '')
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
    register: r.register ?? { description: '', devices: [] },
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
  tokenCost: number
}

/**
 * Produce the LLM portion of a report: the narrative interpretation grounded in
 * the (already-computed) analytics, and — when a computed delta is supplied —
 * a change-summary narrative grounded in that delta. Returns the total token
 * cost across both calls for the snapshot's meta.
 *
 * @param computedDelta the deterministic delta (without narrative); null for baseline
 */
export async function synthesizeReport(
  profile: Profile,
  posts: Post[],
  analytics: ReportAnalytics,
  computedDelta: Omit<ChangeSummary, 'narrative'> | null,
  prevSnapshot: IntelReportSnapshot | null,
  settings: SynthesisSettings,
): Promise<SynthesizeReportResult> {
  const { own } = partitionPosts(profile, posts)
  const transcript = buildTranscript(own, settings.contextCap)
  const inboundCount = posts.length - own.length

  const resp = await venice<ChatCompletionResponse>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      temperature: settings.temperature,
      messages: [
        { role: 'system', content: REPORT_SYSTEM },
        {
          role: 'user',
          content: `Profile: ${JSON.stringify(profile)}\n\nCOMPUTED ANALYTICS (ground truth — own posts only; ${inboundCount} inbound mentions excluded from metrics):\n${JSON.stringify(analytics)}\n\nTarget's own posts:\n${transcript}`,
        },
      ],
    }),
  })
  const choice = resp.choices?.[0]
  if (!choice?.message?.content) {
    throw new Error('Venice report synthesis returned no content — the model may have refused or filtered the request')
  }
  const narrative = parseReport(choice.message.content)
  let tokenCost = resp.usage?.total_tokens ?? 0

  let changeNarrative: string | null = null
  if (computedDelta && prevSnapshot) {
    const changeResp = await venice<ChatCompletionResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        temperature: settings.temperature,
        messages: [
          { role: 'system', content: CHANGE_SYSTEM },
          {
            role: 'user',
            content: `Previous report narrative:\n${JSON.stringify(prevSnapshot.narrative)}\n\nCOMPUTED DELTA (ground truth):\n${JSON.stringify(computedDelta)}`,
          },
        ],
      }),
    })
    tokenCost += changeResp.usage?.total_tokens ?? 0
    const changeContent = changeResp.choices?.[0]?.message?.content
    if (changeContent) {
      const parsed = extractJson(changeContent) as { narrative?: string } | null
      changeNarrative = stripMarkdownLabel(parsed?.narrative ?? '')
    } else {
      changeNarrative = ''
    }
  }

  return { narrative, changeNarrative, tokenCost }
}

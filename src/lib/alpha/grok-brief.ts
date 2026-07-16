import { venice } from '../venice-client'
import { estimateUsageUsd } from '../venice/usage-cost'
import { compareGrokDesc, isGrokModel } from '../venice-grok-utils'
import type { ChatCompletionResponse, VeniceModel } from '../../types/venice'
import type { AlphaRail, RailCountsCache, VelocityResult } from './types'
import { computeVelocity, formatVelocityPct } from './velocity'

export const ALPHA_GROK_BRIEF_TTL_MS = 20 * 60_000

/** Prefer highest-version Grok with native X search; any X-search model otherwise. */
export function pickAlphaGrokModel(models: VeniceModel[]): string | null {
  const withX = models.filter((m) => m.model_spec?.capabilities?.supportsXSearch === true)
  if (withX.length === 0) return null
  const groks = withX.filter((m) => isGrokModel(m.id)).sort(compareGrokDesc)
  return groks[0]?.id ?? withX[0]!.id
}

export interface AlphaGrokBriefResult {
  markdown: string
  model: string
  fetchedAt: number
  cost: number
}

function railHeatLine(
  rail: AlphaRail,
  counts: RailCountsCache | undefined,
): string {
  if (!counts || counts.query !== rail.query) {
    return `- ${rail.label}: query \`${rail.query}\` (no live counts yet)`
  }
  const v = computeVelocity(counts.buckets)
  return [
    `- ${rail.label}: query \`${rail.query}\``,
    `  volume 7d≈${counts.totalTweetCount}`,
    `  1h ${formatVelocityPct(v.hourPct)} (${v.lastHourCount} vs ${v.priorHourCount})`,
    `  24h ${formatVelocityPct(v.dayPct)} (${v.lastDayCount} vs ${v.priorDayCount})`,
  ].join('\n')
}

export function buildAlphaGrokPrompt(
  rails: AlphaRail[],
  countsByRail: Record<string, RailCountsCache>,
  extraContext?: string,
): string {
  const enabled = rails.filter((r) => r.enabled)
  const heat = enabled.map((r) => railHeatLine(r, countsByRail[r.id])).join('\n')
  return `You are Alpha Radar inside a Venice + X operator console. You have native live X/Twitter search.

Mission: surface real alpha — accelerating narratives, sharp posts, accounts to watch — not generic recaps or VeniceStats-style buzz digests.

Watchlist rails (X recent-search style queries + live volume/velocity when available):
${heat || '(no rails)'}
${extraContext ? `\nExtra context:\n${extraContext}\n` : ''}
Using live X search, produce a tight briefing with these sections (markdown):

## Accelerating now
What is actually moving on X right now for this sphere (specific topics, not vibes).

## Watch these posts / accounts
3–7 concrete items: @handles and/or post themes you can verify via X search. Prefer primary sources.

## Signal vs noise
What looks real vs engagement farming / recycled takes.

## Angles for posting
2–4 sharp angles an operator could write about today (not draft full posts).

Rules:
- Be terse and specific. Numbers and names over adjectives.
- If search is thin, say so — do not invent posts.
- No price predictions or financial advice.
- Do not restate VeniceStats buzz feeds; stay on X-native signal.`
}

/**
 * One-shot Grok completion with Venice `enable_x_search` (native Grok X search).
 */
export async function fetchAlphaGrokBrief(opts: {
  model: string
  models: VeniceModel[]
  rails: AlphaRail[]
  countsByRail: Record<string, RailCountsCache>
  extraContext?: string
  signal?: AbortSignal
}): Promise<AlphaGrokBriefResult> {
  const prompt = buildAlphaGrokPrompt(opts.rails, opts.countsByRail, opts.extraContext)
  const resp = await venice<ChatCompletionResponse>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: opts.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a high-signal X radar analyst. Prefer verified live X search findings. No fluff.',
        },
        { role: 'user', content: prompt },
      ],
      stream: false,
      temperature: 0.4,
      max_tokens: 2048,
      venice_parameters: {
        enable_x_search: true,
        include_venice_system_prompt: false,
      },
    }),
    signal: opts.signal,
  })

  const markdown = resp.choices?.[0]?.message?.content?.trim() || '_No brief returned._'
  const modelMeta = opts.models.find((m) => m.id === opts.model)
  const cost = estimateUsageUsd(modelMeta, resp.usage)

  return {
    markdown,
    model: opts.model,
    fetchedAt: Date.now(),
    cost,
  }
}

/** Sort key: higher = hotter (for rail ranking). */
export function railHeatScore(velocity: VelocityResult | null, totalTweetCount: number): number {
  const hour = velocity?.hourPct
  const day = velocity?.dayPct
  const h = hour != null && Number.isFinite(hour) ? hour : 0
  const d = day != null && Number.isFinite(day) ? day : 0
  // Emphasize 1h acceleration; volume as tie-breaker (log scale).
  return h * 10 + d + Math.log10(Math.max(totalTweetCount, 1))
}

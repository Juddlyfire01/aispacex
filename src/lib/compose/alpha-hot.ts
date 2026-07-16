import type { AlphaArchiveState } from '../alpha/archive'
import type { AlphaColdBrief, AlphaColdStory } from '../alpha/types'
import { estimateTokens } from './token-estimate'

/** Soft cap for the Alpha Radar hot-window slice. */
export const ALPHA_HOT_TOKEN_BUDGET = 1000

const GLOBAL_BRIEF_MAX = 600
const RAIL_BRIEF_MAX = 200
const MAX_RAIL_BRIEFS = 2
const MAX_STORIES = 5

function byNewest<T extends { fetchedAt: number }>(a: T, b: T): number {
  return b.fetchedAt - a.fetchedAt
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}

function buildBlock(
  globalBrief: AlphaColdBrief | null,
  railBriefs: AlphaColdBrief[],
  stories: AlphaColdStory[],
  globalMax: number,
  railMax: number,
): string {
  const lines: string[] = [
    '===== ALPHA RADAR (24h + pins) =====',
    '24h window + pins; use alpha_* for more.',
  ]

  if (globalBrief) {
    lines.push(
      `Global brief [${globalBrief.id}]:`,
      truncate(globalBrief.markdown.replace(/\s+/g, ' ').trim(), globalMax),
    )
  }

  for (const r of railBriefs) {
    const label = r.railLabel ?? r.railId ?? 'rail'
    lines.push(
      `Rail brief [${r.id}] ${label}:`,
      truncate(r.markdown.replace(/\s+/g, ' ').trim(), railMax),
    )
  }

  if (stories.length) {
    lines.push('Stories:')
    for (const s of stories) {
      lines.push(`- [${s.id}] ${s.name}`)
    }
  }

  lines.push('===== END ALPHA RADAR =====')
  return lines.join('\n')
}

/**
 * Format a small Alpha Radar slice for the Compose hot window.
 * Newest 1 global brief, up to 2 rail briefs, up to 5 stories.
 * Trims under ALPHA_HOT_TOKEN_BUDGET (stories first, then brief length).
 */
export function formatAlphaHot(state: AlphaArchiveState): string {
  const briefs = Object.values(state.briefs).sort(byNewest)
  const globalBrief = briefs.find((b) => b.kind === 'global') ?? null
  const railBriefs = briefs.filter((b) => b.kind === 'rail').slice(0, MAX_RAIL_BRIEFS)
  let stories = Object.values(state.stories).sort(byNewest).slice(0, MAX_STORIES)

  if (!globalBrief && !railBriefs.length && !stories.length) return ''

  let globalMax = GLOBAL_BRIEF_MAX
  let railMax = RAIL_BRIEF_MAX
  let block = buildBlock(globalBrief, railBriefs, stories, globalMax, railMax)

  while (estimateTokens(block) > ALPHA_HOT_TOKEN_BUDGET && stories.length > 0) {
    stories = stories.slice(0, -1)
    block = buildBlock(globalBrief, railBriefs, stories, globalMax, railMax)
  }

  while (
    estimateTokens(block) > ALPHA_HOT_TOKEN_BUDGET &&
    (globalMax > 80 || railMax > 40)
  ) {
    globalMax = Math.max(80, Math.floor(globalMax * 0.7))
    railMax = Math.max(40, Math.floor(railMax * 0.7))
    block = buildBlock(globalBrief, railBriefs, stories, globalMax, railMax)
  }

  return block
}

/** Merge prior hot pack text with an Alpha Radar slice. */
export function mergeHotWithAlpha(
  priorText: string,
  state: AlphaArchiveState,
): { text: string; alphaTokens: number } {
  const alphaBlock = formatAlphaHot(state)
  if (!alphaBlock) {
    return { text: priorText, alphaTokens: 0 }
  }
  const text = priorText.trim()
    ? `${priorText.trim()}\n\n${alphaBlock}`
    : alphaBlock
  return { text, alphaTokens: estimateTokens(alphaBlock) }
}

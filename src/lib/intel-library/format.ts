import type { Edge, IntelReportSnapshot, Post, Profile } from '../x-intel/types'

function shortDate(iso: string): string {
  // Prefer YYYY-MM-DD when parseable; fall back to raw prefix.
  const d = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : iso
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Human label for when a library subject was last gathered/refreshed. */
export function formatGatherAge(refreshedAt: string | null | undefined): string {
  if (!refreshedAt?.trim()) return 'gather unknown'
  return `gathered ${shortDate(refreshedAt)}`
}

/** Hot-window subject heading with optional gather stamp. */
export function formatSubjectHeading(
  username: string,
  kind: string,
  refreshedAt?: string | null,
): string {
  return `### @${username} (${kind}) · ${formatGatherAge(refreshedAt)}`
}

export function formatProfileLine(p: Profile): string {
  const verified = p.verified?.type ? ` · ${p.verified.type}✓` : ''
  const head = `@${p.username} (${p.displayName}) · ${p.metrics.followers} followers${verified}`
  if (p.bio) return `${head}\n  Bio: ${collapseWhitespace(p.bio)}`
  return head
}

export function formatPostLine(p: Post): string {
  const date = shortDate(p.createdAt)
  const text = collapseWhitespace(p.text)
  return `  - [${date}] id=${p.id} (${p.kind}) ♥${p.metrics.likes} — ${text}`
}

export function formatReportBrief(s: IntelReportSnapshot): string {
  const date = shortDate(s.createdAt)
  const summary = s.narrative.executiveSummary
  const assessment = s.narrative.strategicAssessment.slice(0, 500)
  return `Report ${s.id} (${date})\nSummary: ${summary}\nAssessment: ${assessment}`
}

export function formatEdgeLine(e: Edge): string {
  return `  - ${e.kind} @${e.targetUsername} ×${e.weight}`
}

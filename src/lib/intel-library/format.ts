import type { Edge, IntelReportSnapshot, Post, Profile } from '../x-intel/types'

function shortDate(iso: string): string {
  // Prefer YYYY-MM-DD when parseable; fall back to raw prefix.
  const d = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : iso
}

export function formatProfileLine(p: Profile): string {
  const head = `@${p.username} (${p.displayName}) · ${p.metrics.followers} followers`
  if (p.bio) return `${head}\n  ${p.bio}`
  return head
}

export function formatPostLine(p: Post): string {
  const date = shortDate(p.createdAt)
  return `  - [${date}] id=${p.id} (${p.kind}) ♥${p.metrics.likes} — ${p.text}`
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

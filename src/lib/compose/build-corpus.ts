// Assembles the "All" compose context: a single, LLM-digestible text dump of the
// entire gathered X data set — every connected self account and every analyzed
// target. This is deliberately a flat data dump (not RAG, no retrieval): at the
// current corpus size the whole thing fits in context, and a full dump lets the
// model reason across subjects. As the corpus grows this is the seam where we
// swap the dump for tool-driven retrieval (grep/search) — see composeAllContext.
import type { IntelReport } from '../../stores/x-intel-store'
import type { SelfAccount } from '../../stores/x-self-store'
import type { Post, Profile } from '../x-intel/types'

/** How many posts we include per subject in the dump. Keeps the dump bounded
 *  while the corpus is small; the real cap is the model's context window. */
const POSTS_PER_SUBJECT = 40

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function profileLine(p: Profile): string {
  const v = p.verified.type ? ` · ${p.verified.type}✓` : ''
  return (
    `@${p.username} (${p.displayName})${v} — ` +
    `${fmtNum(p.metrics.followers)} followers, ${fmtNum(p.metrics.following)} following, ${fmtNum(p.metrics.posts)} posts` +
    (p.location ? ` · ${p.location}` : '') +
    (p.bio ? `\n  Bio: ${p.bio.replace(/\s+/g, ' ').trim()}` : '')
  )
}

function postLine(p: Post): string {
  const m = p.metrics
  const eng = `♥${fmtNum(m.likes)} ↺${fmtNum(m.reposts)} 💬${fmtNum(m.replies)}`
  const date = p.createdAt.slice(0, 10)
  const text = p.text.replace(/\s+/g, ' ').trim()
  return `  - [${date}] (${p.kind}) ${eng} — ${text}`
}

function subjectBlock(
  heading: string,
  profile: Profile | null,
  posts: Post[],
): string {
  const lines: string[] = [heading]
  if (profile) lines.push(profileLine(profile))
  const shown = posts.slice(0, POSTS_PER_SUBJECT)
  if (shown.length) {
    lines.push(`  Posts (${shown.length} of ${posts.length}):`)
    for (const p of shown) lines.push(postLine(p))
  } else {
    lines.push('  (no posts gathered)')
  }
  return lines.join('\n')
}

export interface CorpusInput {
  selfAccounts: SelfAccount[]
  reports: IntelReport[]
}

/** Build the full-corpus dump. Returns an empty string when there's nothing
 *  gathered yet, so callers can fall back to a plain conversation. */
export function buildCorpus({ selfAccounts, reports }: CorpusInput): string {
  const blocks: string[] = []

  for (const acc of selfAccounts) {
    if (!acc.profile && acc.posts.length === 0) continue
    blocks.push(subjectBlock(`### YOUR ACCOUNT: @${acc.username}`, acc.profile, acc.posts))
  }

  for (const r of reports) {
    if (!r.profile && r.posts.length === 0) continue
    blocks.push(subjectBlock(`### TARGET: @${r.username}`, r.profile, r.posts))
  }

  if (blocks.length === 0) return ''

  const totalPosts =
    selfAccounts.reduce((n, a) => n + a.posts.length, 0) +
    reports.reduce((n, r) => n + r.posts.length, 0)

  const header =
    `Corpus summary: ${selfAccounts.length} connected account(s), ${reports.length} analyzed target(s), ` +
    `${totalPosts} total gathered posts.`

  return `${header}\n\n${blocks.join('\n\n')}`
}

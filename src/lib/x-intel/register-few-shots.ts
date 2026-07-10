// Build / backfill register few-shot exemplars from notable + high-density posts.
import type { Post } from './types'
import type { RegisterFewShot } from '../compose/register'

const MAX_FEW_SHOTS = 10
const MAX_EXCERPT = 900

function densityScore(p: Post): number {
  const m = p.metrics
  const engagement = (m.likes ?? 0) + (m.reposts ?? 0) * 2 + (m.replies ?? 0) + (m.quotes ?? 0) * 2
  const len = p.text?.length ?? 0
  // Prefer longer metric-ish posts with engagement.
  return engagement * 0.01 + Math.min(len, 800) * 0.05 + (len > 120 ? 5 : 0)
}

function labelFromWhy(why: string | undefined, fallback: string): string {
  const w = (why ?? '').trim()
  if (!w) return fallback
  // Short slug-ish label from why text.
  const clipped = w.replace(/\s+/g, ' ').slice(0, 48)
  return clipped || fallback
}

function excerpt(text: string): string {
  const t = text.trim()
  if (t.length <= MAX_EXCERPT) return t
  return `${t.slice(0, MAX_EXCERPT).trimEnd()}…`
}

/**
 * Prefer model-supplied few-shots (fill missing text from posts by id), then
 * backfill from notablePosts and high-density own posts up to MAX_FEW_SHOTS.
 */
export function enrichRegisterFewShots(args: {
  fewShotExamples?: RegisterFewShot[]
  notablePosts: { postId: string; why: string }[]
  ownPosts: Post[]
}): RegisterFewShot[] {
  const byId = new Map(args.ownPosts.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const out: RegisterFewShot[] = []

  const push = (ex: RegisterFewShot) => {
    const key = ex.postId ?? `t:${ex.text.slice(0, 40)}`
    if (seen.has(key)) return
    if (!ex.text.trim()) return
    seen.add(key)
    out.push({
      label: ex.label.trim() || 'example',
      postId: ex.postId,
      text: excerpt(ex.text),
    })
  }

  for (const raw of args.fewShotExamples ?? []) {
    if (out.length >= MAX_FEW_SHOTS) break
    let text = raw.text?.trim() ?? ''
    if (!text && raw.postId) {
      const post = byId.get(raw.postId)
      if (post?.text) text = post.text
    }
    if (!text) continue
    push({ label: raw.label || 'example', postId: raw.postId, text })
  }

  for (const np of args.notablePosts) {
    if (out.length >= MAX_FEW_SHOTS) break
    const post = byId.get(np.postId)
    if (!post?.text?.trim()) continue
    push({
      label: labelFromWhy(np.why, 'notable'),
      postId: np.postId,
      text: post.text,
    })
  }

  const ranked = [...args.ownPosts]
    .filter((p) => p.text?.trim() && !seen.has(p.id))
    .sort((a, b) => densityScore(b) - densityScore(a))

  for (const p of ranked) {
    if (out.length >= MAX_FEW_SHOTS) break
    push({ label: 'dense_metrics', postId: p.id, text: p.text })
  }

  return out
}

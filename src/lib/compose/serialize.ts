import type { PostDraft } from './types'

// Serialize a draft to plain text for copy-to-X. Threads are joined with a
// numbered separator; reply/quote context is noted at the top since the API
// can't post those on pay-per-use.

export function serializeDraftForCopy(draft: PostDraft): string {
  const lines: string[] = []

  if (draft.target.kind === 'reply') {
    lines.push(`(Reply to @${draft.target.toUsername}${draft.target.toPostId ? ` post ${draft.target.toPostId}` : ''})`)
  } else if (draft.target.kind === 'quote') {
    lines.push(`(Quote @${draft.target.username}${draft.target.postId ? ` post ${draft.target.postId}` : ''})`)
  }

  const body =
    draft.segments.length > 1
      ? draft.segments.map((s, i) => `${i + 1}/${draft.segments.length} ${s.text}`.trim()).join('\n\n')
      : (draft.segments[0]?.text ?? '')

  if (lines.length > 0) return `${lines.join('\n')}\n\n${body}`
  return body
}

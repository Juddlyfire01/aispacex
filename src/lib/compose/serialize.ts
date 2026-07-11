import type { PostDraft } from './types'

// Serialize a draft to plain text for copy-to-X. Threads are joined with a
// numbered separator. Reply/quote targeting stays in the draft UI — paste
// should be body-only so it can go straight into X's composer.

export function serializeDraftForCopy(draft: PostDraft): string {
  if (draft.segments.length > 1) {
    return draft.segments.map((s, i) => `${i + 1}/${draft.segments.length} ${s.text}`.trim()).join('\n\n')
  }
  return draft.segments[0]?.text ?? ''
}

import type { PostDraft } from './types'

// Browser helper to post a draft through the server-side write proxy
// (/api/x/post). The browser sends no token; the serverless function attaches
// the user-context access token. Errors carry a flag so the UI can prompt a
// reconnect when the write scope is missing.

export class XPostError extends Error {
  status: number
  needsReconnect: boolean

  constructor(message: string, status: number, needsReconnect: boolean) {
    super(message)
    this.name = 'XPostError'
    this.status = status
    this.needsReconnect = needsReconnect
  }
}

export interface PostResult {
  id: string
  ids: string[]
  url: string
}

/** Normalize a draft into the write-proxy body (originals/threads only). */
function toBody(draft: PostDraft) {
  return {
    segments: draft.segments.map((s) => ({
      text: s.text,
      poll: s.poll ? { options: s.poll.options, durationMinutes: s.poll.durationMinutes } : undefined,
    })),
    target: draft.target.kind === 'reply'
      ? { kind: 'reply' as const, toPostId: draft.target.toPostId, toUsername: draft.target.toUsername }
      : { kind: 'original' as const },
    replySettings: draft.replySettings,
    madeWithAi: draft.madeWithAi,
  }
}

export async function postDraft(draft: PostDraft): Promise<PostResult> {
  const res = await fetch('/api/x/post', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBody(draft)),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message =
      json?.error === 'x_not_connected'
        ? 'Connect your X account to post.'
        : json?.error === 'x_session_expired'
          ? 'Your X session expired — reconnect to post.'
          : json?.error || `Post failed (HTTP ${res.status})`
    const needsReconnect = Boolean(json?.needsReconnect) || res.status === 401
    throw new XPostError(message, res.status, needsReconnect)
  }

  return json as PostResult
}

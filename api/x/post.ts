// POST /api/x/post
// Authenticated write to the X API v2 for the OAuth-connected user. Creates a
// post — or a thread, by chaining each segment as a reply to the previous — and
// returns the URL of the first post. The browser sends NO token; we attach the
// user-context access token (refreshing if needed) server-side.
//
// Originals/threads (+ polls, reply_settings, made_with_ai) and summoned
// replies (target.kind === 'reply' with toPostId) are created here. X pay-per-use
// rejects replies that are not a summon (@mention / quote of you). Quotes remain
// copy-only and are never sent through this path.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { X_API_BASE } from '../_lib/x-oauth.js'
import { resolveSession, clearSessionCookies } from '../_lib/x-session.js'

interface SegmentInput {
  text?: string
  poll?: { options?: string[]; durationMinutes?: number }
}
interface PostBody {
  segments?: SegmentInput[]
  target?:
    | { kind: 'original' }
    | { kind: 'reply'; toPostId: string; toUsername?: string }
  replySettings?: string
  madeWithAi?: boolean
}

interface CreatedTweet {
  data?: { id: string; text: string }
  errors?: { title?: string; detail?: string }[]
  detail?: string
  title?: string
}

function buildPayload(
  seg: SegmentInput,
  opts: { first: boolean; inReplyTo?: string; replySettings?: string; madeWithAi?: boolean },
): Record<string, unknown> {
  const payload: Record<string, unknown> = { text: seg.text ?? '' }

  if (seg.poll?.options && seg.poll.options.length >= 2) {
    payload.poll = {
      options: seg.poll.options.slice(0, 4),
      duration_minutes: seg.poll.durationMinutes ?? 1440,
    }
  }
  if (opts.inReplyTo) {
    payload.reply = { in_reply_to_tweet_id: opts.inReplyTo }
  }
  if (opts.first) {
    if (opts.replySettings && opts.replySettings !== 'everyone') {
      payload.reply_settings = opts.replySettings
    }
    if (opts.madeWithAi) payload.made_with_ai = true
  }
  return payload
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let session
  try {
    session = await resolveSession(req)
  } catch {
    clearSessionCookies(res)
    return res.status(401).json({ error: 'x_session_expired' })
  }
  if (!session) return res.status(401).json({ error: 'x_not_connected' })
  if (session.setCookies.length) res.setHeader('Set-Cookie', session.setCookies)

  const body = req.body as PostBody
  const segments = (body?.segments ?? []).filter((s) => (s.text ?? '').trim() !== '' || s.poll)
  if (segments.length === 0) return res.status(400).json({ error: 'empty_draft' })

  const replyBase =
    body.target?.kind === 'reply' && body.target.toPostId ? body.target.toPostId : undefined

  const created: { id: string }[] = []
  let prevId: string | undefined = replyBase

  for (let i = 0; i < segments.length; i++) {
    const payload = buildPayload(segments[i], {
      first: i === 0,
      inReplyTo: prevId,
      replySettings: body.replySettings,
      madeWithAi: body.madeWithAi,
    })

    let xRes: Response
    try {
      xRes = await fetch(`${X_API_BASE}/tweets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } catch {
      return res.status(502).json({ error: 'x_upstream_unreachable', postedSoFar: created })
    }

    const json = (await xRes.json().catch(() => ({}))) as CreatedTweet
    if (!xRes.ok || !json.data?.id) {
      const detail =
        json.errors?.[0]?.detail || json.detail || json.title || `X API error (${xRes.status})`
      // 403 usually means the write scope is missing → client prompts reconnect.
      return res.status(xRes.status === 200 ? 502 : xRes.status).json({
        error: detail,
        needsReconnect: xRes.status === 403,
        postedSoFar: created,
      })
    }

    created.push({ id: json.data.id })
    prevId = json.data.id
  }

  const firstId = created[0].id
  return res.status(200).json({
    id: firstId,
    ids: created.map((c) => c.id),
    url: `https://x.com/i/web/status/${firstId}`,
  })
}

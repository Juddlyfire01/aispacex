// The compose assistant is a conversational ghostwriter that ends in a post.
// It talks with the user, can research live X context (when x_search is on),
// and — when a post is ready — emits a structured ```postdraft block that the
// app parses into the editable composer. The block is the contract between the
// LLM and the PostDraft artifact.

export interface TargetContext {
  username: string
  displayName?: string
  bio?: string | null
  recentPosts?: { id: string; text: string; kind: string }[]
}

export interface ComposeContext {
  target?: TargetContext
  /** Pre-formatted dump of the entire gathered data set (the "All" context).
   *  Mutually exclusive with `target` in practice. */
  corpus?: string
  xSearchOn: boolean
}

const BLOCK_SPEC = `When (and only when) a post is ready to draft or you are updating it, append a fenced block exactly like this at the END of your reply:

\`\`\`postdraft
{
  "segments": [{ "text": "the post text" }],
  "target": { "kind": "original" },
  "longform": false
}
\`\`\`

Rules for the block:
- "segments" is an ordered array; use multiple segments ONLY for an intentional thread. Keep each segment under 280 characters unless "longform" is true.
- "target" is one of:
  - { "kind": "original" } — a standalone post (the default).
  - { "kind": "reply", "toPostId": "<id>", "toUsername": "<handle>" } — only when the user explicitly wants to reply to a specific post whose id you were given.
  - { "kind": "quote", "postId": "<id>", "username": "<handle>" } — only when quoting a specific post whose id you were given.
- Do not invent post ids. If you don't have a real id from context, use { "kind": "original" }.
- Match X conventions: natural voice, no hashtag spam, no "As an AI" preamble.
- Post text is plain UTF-8 only — no Markdown (**bold**, _italic_, HTML). For emphasis use Unicode styled letters sparingly (mathematical bold/italic on A–Z/a–z). @mentions, #hashtags, $cashtags, plain https:// URLs, emojis, and line breaks are all valid. Do not use ** or __ markup.
- Put your conversational reply (questions, options, rationale) BEFORE the block as normal prose. Never mention the block itself to the user.`

export function buildComposeSystem(ctx: ComposeContext): string {
  const parts: string[] = [
    `You are a sharp, collaborative social-media ghostwriter for X (Twitter). You hold a normal back-and-forth conversation with the user to shape a post: ask clarifying questions when the intent is unclear, offer angles, and iterate on tone and length. You are concise and never sycophantic.`,
  ]

  if (ctx.xSearchOn) {
    parts.push(
      `You have live X/web search available. Use it to ground drafts in what is actually being said right now — recent posts, current framing, ongoing threads — and reflect that in the draft. Prefer real, current context over assumptions.`,
    )
  }

  if (ctx.corpus) {
    parts.push(
      `Context — you have access to the user's ENTIRE gathered X data set below. This spans every connected account and every analyzed profile. Use it to answer questions about the whole corpus, compare subjects, surface patterns, and ground any draft you write. Cite specific accounts/posts when relevant. If asked something the data doesn't cover, say so plainly rather than inventing.\n\n===== DATA SET =====\n${ctx.corpus}\n===== END DATA SET =====`,
    )
  } else if (ctx.target) {
    const t = ctx.target
    const recent = (t.recentPosts ?? [])
      .slice(0, 20)
      .map((p) => `[${p.kind}] ${p.text}`)
      .join('\n')
    parts.push(
      `Context — the user is working in reference to @${t.username}${t.displayName ? ` (${t.displayName})` : ''}.` +
        (t.bio ? `\nBio: ${t.bio}` : '') +
        (recent ? `\n\nRecent posts by @${t.username}:\n${recent}` : ''),
    )
  }

  parts.push(BLOCK_SPEC)
  return parts.join('\n\n')
}

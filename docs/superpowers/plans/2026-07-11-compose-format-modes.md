# Compose Format Modes + Articles + Copy Permalinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preferred draft format (`auto` default, persisted override), model teaching for post/thread/long-form/article, Copy-to-X permalink rewrite, and Articles API publish with media.

**Architecture:** Persist `preferredFormat` on the compose store; derive resolved format from `PostDraft`; extend prompts/schemas; rewrite snowflakes in `serializeDraftForCopy`; add optional `draft.article` + markdown→DraftJS converter; new `/api/x/media` + `/api/x/articles` server routes using the existing OAuth session pattern from `/api/x/post`.

**Tech Stack:** TypeScript, Zustand, Vitest, Vercel Node API routes, X API v2 (tweets, media upload, articles), existing `PillGroup` / compose UI.

**Spec:** `docs/superpowers/specs/2026-07-11-compose-format-modes-design.md`

**Phases:** Tasks 1–4 deliver copy + format preference + prompts (shippable alone). Tasks 5–9 deliver Articles authoring + publish with media.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/compose/format.ts` | `PreferredFormat`, `resolveDraftFormat`, preference helpers |
| `src/lib/compose/types.ts` | `ArticleDraft` on `PostDraft` |
| `src/lib/compose/serialize.ts` | Copy text + ID→URL + reply/quote append |
| `src/stores/compose-store.ts` | `preferredFormat` persist (v9) |
| `src/components/compose/format-preference.tsx` | Shared Auto/Post/Thread/Long-form/Article pills |
| `src/lib/compose/compose-prompt.ts` | Format teaching + preference inject |
| `src/lib/compose/draft-block.ts` | Parse `format` + `article` from postdraft |
| `src/lib/compose/draft-writer*.ts` | Pass preference; article-shaped writer notes |
| `src/lib/compose/article-draftjs.ts` | Markdown → DraftJS `content_state` |
| `src/lib/compose/x-media-client.ts` | Browser helper → `/api/x/media` |
| `src/lib/compose/x-article-client.ts` | Browser helper → `/api/x/articles` |
| `api/x/media.ts` | Session + proxy simple image upload to X |
| `api/x/articles.ts` | Draft + publish Articles |
| `src/lib/compose/postability.ts` | Article / media paths |
| `src/components/compose/article-composer.tsx` | Title/body/cover/inline media UI |
| `src/components/compose/compose-actions.tsx` | Post article vs tweet; empty checks |

---

### Task 1: Permalink rewrite in `serializeDraftForCopy`

**Files:**
- Modify: `src/lib/compose/serialize.ts`
- Modify: `src/lib/compose/serialize.test.ts`
- Use: `src/lib/x-intel/evidence.ts` (`postUrl`, `POST_ID_RE`, `normalizePostId`)

- [ ] **Step 1: Write failing tests**

Replace/extend `serialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { serializeDraftForCopy } from './serialize'
import { emptyDraft, emptySegment } from './types'
import type { PostDraft } from './types'

const ID = '2075587500908333628'

function draftWith(texts: string[], target: PostDraft['target'] = { kind: 'original' }): PostDraft {
  const draft = emptyDraft(target)
  draft.segments = texts.map((t) => ({ ...emptySegment(), text: t }))
  return draft
}

describe('serializeDraftForCopy', () => {
  it('rewrites bare snowflakes and post: ids to permalinks', () => {
    const out = serializeDraftForCopy(draftWith([`see ${ID} and post:${ID}`]))
    expect(out).toContain(`https://x.com/i/status/${ID}`)
    expect(out).not.toMatch(new RegExp(`(?<!status/)${ID}`))
  })

  it('does not double-rewrite ids already inside status URLs', () => {
    const url = `https://x.com/i/status/${ID}`
    expect(serializeDraftForCopy(draftWith([`link ${url}`])).trim()).toBe(`link ${url}`)
  })

  it('appends reply target permalink', () => {
    const out = serializeDraftForCopy(
      draftWith(['nice'], { kind: 'reply', toPostId: ID, toUsername: 'bob' }),
    )
    expect(out).toContain('nice')
    expect(out).toContain(`https://x.com/i/status/${ID}`)
    expect(out).toMatch(/@bob/)
  })

  it('appends quote target permalink', () => {
    const out = serializeDraftForCopy(
      draftWith(['adding'], { kind: 'quote', postId: ID, username: 'ann' }),
    )
    expect(out).toContain('adding')
    expect(out).toContain(`https://x.com/i/status/${ID}`)
    expect(out).toMatch(/@ann/)
  })

  it('numbers thread segments after rewrite', () => {
    const out = serializeDraftForCopy(draftWith([`first ${ID}`, 'second']))
    expect(out.startsWith('1/2')).toBe(true)
    expect(out).toContain('2/2 second')
    expect(out).toContain(`https://x.com/i/status/${ID}`)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/compose/serialize.test.ts`  
Expected: FAIL (reply/quote still body-only; no URL rewrite)

- [ ] **Step 3: Implement serialize**

```ts
import type { PostDraft } from './types'
import { POST_ID_RE, normalizePostId, postUrl } from '../x-intel/evidence'

/** Rewrite bare / post: snowflakes to permalinks; leave ids inside URLs alone. */
export function rewritePostIdsToUrls(text: string): string {
  return text.replace(new RegExp(POST_ID_RE.source, 'g'), (match, id: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - 32), offset)
    if (/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:i\/status|[^/\s]+\/status)\/?$/i.test(before)) {
      return match
    }
    if (/https?:\/\/\S*$/i.test(before)) return match
    const normalized = normalizePostId(id)
    if (!normalized) return match
    return postUrl(normalized)
  })
}

function targetSuffix(draft: PostDraft): string {
  if (draft.target.kind === 'reply') {
    const u = draft.target.toUsername.replace(/^@/, '')
    return `\n\nReplying to @${u}: ${postUrl(draft.target.toPostId)}`
  }
  if (draft.target.kind === 'quote') {
    const u = draft.target.username.replace(/^@/, '')
    return `\n\nQuoting @${u}: ${postUrl(draft.target.postId)}`
  }
  return ''
}

function serializeArticle(draft: PostDraft): string | null {
  const a = draft.article
  if (!a) return null
  const title = a.title.trim()
  const body = rewritePostIdsToUrls(a.bodyMarkdown ?? '')
  if (!title && !body.trim()) return null
  const head = title ? `${title}\n\n` : ''
  return `${head}${body}`.trim() + targetSuffix(draft)
}

export function serializeDraftForCopy(draft: PostDraft): string {
  const article = serializeArticle(draft)
  if (article) return article

  const parts =
    draft.segments.length > 1
      ? draft.segments.map((s, i) =>
          `${i + 1}/${draft.segments.length} ${rewritePostIdsToUrls(s.text)}`.trim(),
        )
      : [rewritePostIdsToUrls(draft.segments[0]?.text ?? '')]

  return parts.join('\n\n').trimEnd() + targetSuffix(draft)
}
```

Note: `draft.article` may not exist until Task 5 — use optional chaining / cast, or add a temporary `article?: { title: string; bodyMarkdown: string }` stub type in Task 1 and flesh out in Task 5. Prefer adding the minimal optional field in types in Step 3 of this task:

```ts
// types.ts — minimal stub until Task 5
article?: { title: string; bodyMarkdown: string }
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/compose/serialize.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/compose/serialize.ts src/lib/compose/serialize.test.ts src/lib/compose/types.ts
git commit -m "feat(compose): rewrite post ids to permalinks on copy to X"
```

---

### Task 2: `PreferredFormat` + `resolveDraftFormat`

**Files:**
- Create: `src/lib/compose/format.ts`
- Create: `src/lib/compose/format.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { resolveDraftFormat, PREFERRED_FORMATS } from './format'
import { emptyDraft, emptySegment } from './types'

describe('resolveDraftFormat', () => {
  it('resolves article when title or body present', () => {
    const d = emptyDraft()
    d.article = { title: 'T', bodyMarkdown: '', inlineMedia: [] }
    expect(resolveDraftFormat(d)).toBe('article')
  })

  it('resolves thread for multiple segments', () => {
    const d = emptyDraft()
    d.segments = [emptySegment(), emptySegment()]
    expect(resolveDraftFormat(d)).toBe('thread')
  })

  it('resolves longform for single longform segment', () => {
    const d = emptyDraft()
    d.longform = true
    expect(resolveDraftFormat(d)).toBe('longform')
  })

  it('resolves post otherwise', () => {
    const d = emptyDraft()
    d.longform = false
    expect(resolveDraftFormat(d)).toBe('post')
  })
})

describe('PREFERRED_FORMATS', () => {
  it('lists auto and four shapes', () => {
    expect(PREFERRED_FORMATS.map((f) => f.value)).toEqual([
      'auto',
      'post',
      'thread',
      'longform',
      'article',
    ])
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`format` module missing)

Run: `npx vitest run src/lib/compose/format.test.ts`

- [ ] **Step 3: Implement `format.ts` + expand `ArticleDraft` on types**

```ts
// format.ts
import type { PostDraft } from './types'

export type PreferredFormat = 'auto' | 'post' | 'thread' | 'longform' | 'article'
export type ResolvedFormat = Exclude<PreferredFormat, 'auto'>

export const PREFERRED_FORMATS: { value: PreferredFormat; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'post', label: 'Post' },
  { value: 'thread', label: 'Thread' },
  { value: 'longform', label: 'Long-form' },
  { value: 'article', label: 'Article' },
]

export function resolveDraftFormat(draft: PostDraft): ResolvedFormat {
  const a = draft.article
  if (a && (a.title.trim() || a.bodyMarkdown.trim())) return 'article'
  if (draft.segments.length > 1) return 'thread'
  if (draft.longform) return 'longform'
  return 'post'
}

/** Clear stale article when switching to a non-article shape. */
export function clearArticleIfStale<T extends Partial<PostDraft>>(
  patch: T,
  nextResolved: ResolvedFormat,
): T {
  if (nextResolved !== 'article' && patch.article !== undefined) {
    return { ...patch, article: undefined }
  }
  return patch
}
```

In `types.ts`:

```ts
export interface ArticleDraft {
  title: string
  bodyMarkdown: string
  contentState?: unknown
  cover?: MediaItem
  inlineMedia: MediaItem[]
}

export interface PostDraft {
  // ...existing fields
  article?: ArticleDraft
}
```

Export `emptyArticleDraft()`:

```ts
export function emptyArticleDraft(): ArticleDraft {
  return { title: '', bodyMarkdown: '', inlineMedia: [] }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/compose/format.ts src/lib/compose/format.test.ts src/lib/compose/types.ts
git commit -m "feat(compose): add preferred/resolved draft format helpers"
```

---

### Task 3: Persist `preferredFormat` + settings/drawer UI

**Files:**
- Modify: `src/stores/compose-store.ts` (version 8 → 9)
- Modify: `src/stores/compose-store.test.ts` (if present; else add migrate assertion)
- Create: `src/components/compose/format-preference.tsx`
- Modify: `src/components/compose/compose-settings.tsx`
- Modify: `src/components/compose/post-composer.tsx` (or `draft-drawer.tsx` header)

- [ ] **Step 1: Store fields**

Add to `ComposeState`:

```ts
preferredFormat: PreferredFormat
setPreferredFormat: (format: PreferredFormat) => void
```

Defaults: `preferredFormat: 'auto'`.

In `migrateComposeState`:

```ts
if (version < 9 && state.preferredFormat == null) {
  state.preferredFormat = 'auto'
}
```

Bump `version: 9`, include `preferredFormat` in `partialize`, add `setPreferredFormat: (preferredFormat) => set({ preferredFormat })`.

- [ ] **Step 2: Shared UI component**

```tsx
// format-preference.tsx
import { useComposeStore, type PreferredFormat } from '../../stores/compose-store'
import { PREFERRED_FORMATS } from '../../lib/compose/format'
import { Label, PillGroup } from '../ui/shared'

export function FormatPreference({ title = 'Preferred format' }: { title?: string }) {
  const preferredFormat = useComposeStore((s) => s.preferredFormat)
  const setPreferredFormat = useComposeStore((s) => s.setPreferredFormat)
  return (
    <div>
      <Label title="Auto lets the model choose. Your override persists.">{title}</Label>
      <PillGroup
        ariaLabel="Preferred draft format"
        options={PREFERRED_FORMATS}
        value={preferredFormat}
        onChange={(v) => setPreferredFormat(v as PreferredFormat)}
      />
    </div>
  )
}
```

Export `PreferredFormat` from store (re-export from `format.ts`).

Place `<FormatPreference />` in `compose-settings.tsx` near Draft Model, and in the draft drawer header or top of `post-composer.tsx`.

- [ ] **Step 3: Manual smoke** — load app, change format, reload, confirm persistence.

- [ ] **Step 4: Commit**

```bash
git add src/stores/compose-store.ts src/components/compose/format-preference.tsx src/components/compose/compose-settings.tsx src/components/compose/post-composer.tsx
git commit -m "feat(compose): persist preferred format selector"
```

---

### Task 4: Teach models (prompts + postdraft + writer)

**Files:**
- Modify: `src/lib/compose/compose-prompt.ts`
- Modify: `src/lib/compose/compose-prompt.test.ts`
- Modify: `src/lib/compose/draft-block.ts` (+ test if exists)
- Modify: `src/lib/compose/draft-writer-tool.ts`
- Modify: `src/lib/compose/draft-writer.ts`
- Modify: `src/hooks/use-compose.ts`

- [ ] **Step 1: Extend `ComposeSystemOpts`**

```ts
import type { PreferredFormat } from './format'

export interface ComposeSystemOpts {
  // ...existing
  preferredFormat?: PreferredFormat
  /** Account can natively post long-form / articles when verified. */
  premiumCapable?: boolean
}
```

Add `FORMAT_SPEC` constant covering post / thread / long-form / article decision rules, and that **draft body** citations for external posts must use `https://x.com/i/status/{id}` permalinks (chat prose may still use bare/`post:` ids).

Inject after style / before tools:

```ts
parts.push(FORMAT_SPEC)
if (opts.preferredFormat && opts.preferredFormat !== 'auto') {
  parts.push(
    `User prefers format: ${opts.preferredFormat}. Produce that shape unless they explicitly ask otherwise this turn.`,
  )
} else {
  parts.push(
    `Preferred format is Auto — choose post, thread, long-form, or article from the request using the format rules above.${
      opts.premiumCapable === false
        ? ' Account is not Premium-verified: prefer post/thread unless they insist on long-form/article (copy path).'
        : ''
    }`,
  )
}
```

Update `BLOCK_SPEC` example JSON to include optional `"format"` and optional `"article": { "title", "bodyMarkdown" }`. Rules: `format: "post"` ⇒ one segment, `longform: false`; `thread` ⇒ 2+ segments; `longform` ⇒ one segment `longform: true`; `article` ⇒ populate `article`, segments may be empty/`[]`.

- [ ] **Step 2: Tests for prompt injection**

```ts
it('injects forced preferred format', () => {
  const s = buildComposeSystem({
    modelId: 'm',
    xSearchOn: false,
    toolsEnabled: false,
    preferredFormat: 'article',
  })
  expect(s).toMatch(/User prefers format: article/)
})

it('documents format modes in auto', () => {
  const s = buildComposeSystem({
    modelId: 'm',
    xSearchOn: false,
    toolsEnabled: false,
    preferredFormat: 'auto',
  })
  expect(s).toMatch(/Article/i)
  expect(s).toMatch(/thread/i)
})
```

- [ ] **Step 3: Parse article in `draft-block.ts`**

Normalize `parsed.article` → `ArticleDraft`; if `format === 'article'` or article body/title present, set `draft.article` and optionally clear segments to `[emptySegment()]` or leave as model provided. Set `longform` from format when present.

- [ ] **Step 4: Wire `use-compose.ts`**

Pass `preferredFormat` and `premiumCapable: isVerified` into `buildComposeSystem`. Pass preference into draft-writer brief/notes (`Preferred format: …`).

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/compose/compose-prompt.test.ts src/lib/compose/draft-block.ts` (and any draft-block test file)

- [ ] **Step 6: Commit**

```bash
git add src/lib/compose/compose-prompt.ts src/lib/compose/compose-prompt.test.ts src/lib/compose/draft-block.ts src/lib/compose/draft-writer.ts src/lib/compose/draft-writer-tool.ts src/hooks/use-compose.ts
git commit -m "feat(compose): teach models post/thread/longform/article formats"
```

---

### Task 5: Article composer UI

**Files:**
- Create: `src/components/compose/article-composer.tsx`
- Modify: `src/components/compose/post-composer.tsx` — switch on resolved format / preference
- Modify: `src/stores/compose-store.ts` — helpers to patch article fields if needed via `applyDraftPatch`

- [ ] **Step 1: Build `ArticleComposer`**

Fields:
- Title `<input>`
- Body `<textarea>` (markdown/plain)
- Cover: file input → `MediaItem` with `dataUrl` (reuse patterns from segment media if any; else simple FileReader)
- Inline images: multi attach into `article.inlineMedia`

On change: `applyDraftPatch(threadId, { article: { ...current, ... }, longform: false, segments: draft.segments.length ? draft.segments : [emptySegment()] })`.

When user selects preferred format `article` and article is empty, seed `emptyArticleDraft()`.

When resolved format is `article`, `PostComposer` renders `ArticleComposer` instead of segment list (keep target picker if useful; Articles publish as originals — hide reply/quote or leave copy-only).

- [ ] **Step 2: Empty/over-limit for actions**

In `compose-actions.tsx`, treat article drafts as non-empty when title or body present; skip segment char-limit for articles.

- [ ] **Step 3: Commit**

```bash
git add src/components/compose/article-composer.tsx src/components/compose/post-composer.tsx src/components/compose/compose-actions.tsx
git commit -m "feat(compose): article draft drawer fields"
```

---

### Task 6: Markdown → DraftJS converter

**Files:**
- Create: `src/lib/compose/article-draftjs.ts`
- Create: `src/lib/compose/article-draftjs.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { markdownToContentState } from './article-draftjs'

describe('markdownToContentState', () => {
  it('maps paragraphs to unstyled blocks', () => {
    const cs = markdownToContentState('Hello\n\nWorld')
    expect(cs.blocks.map((b) => b.text)).toEqual(['Hello', 'World'])
    expect(cs.blocks.every((b) => b.type === 'unstyled')).toBe(true)
  })

  it('maps # / ## / ### headers', () => {
    const cs = markdownToContentState('# A\n## B\n### C')
    expect(cs.blocks.map((b) => b.type)).toEqual([
      'header-one',
      'header-two',
      'header-three',
    ])
  })

  it('creates link entities for [text](url)', () => {
    const cs = markdownToContentState('See [docs](https://aispace.bot/)')
    expect(cs.entities.some((e) => e.value.type === 'link')).toBe(true)
    expect(cs.blocks[0].text).toContain('docs')
  })

  it('inserts image atomic blocks for media map keys', () => {
    const cs = markdownToContentState('Intro\n\n![shot](media:img1)\n\nOutro', {
      images: { img1: { mediaId: '123', mediaKey: '456' } },
    })
    expect(cs.blocks.some((b) => b.type === 'atomic')).toBe(true)
    expect(cs.entities.some((e) => e.value.type === 'image')).toBe(true)
  })
})
```

- [ ] **Step 2: Implement minimal converter** matching X Articles shape:

```ts
export interface DraftJsContentState {
  blocks: Array<{
    text: string
    type:
      | 'unstyled'
      | 'header-one'
      | 'header-two'
      | 'header-three'
      | 'unordered-list-item'
      | 'ordered-list-item'
      | 'blockquote'
      | 'atomic'
    entity_ranges?: Array<{ key: number; offset: number; length: number }>
    inline_style_ranges?: Array<{ offset: number; length: number; style: 'bold' | 'italic' | 'strikethrough' }>
  }>
  entities: Array<{
    key: string
    value: {
      type: 'link' | 'image' | 'post'
      mutability: 'immutable' | 'mutable' | 'segmented'
      data: Record<string, unknown>
    }
  }>
}

export function markdownToContentState(
  md: string,
  opts?: { images?: Record<string, { mediaId: string; mediaKey?: string }> },
): DraftJsContentState
```

Rules v1: split on blank lines; `#`/`##`/`###`; `- ` lists; `[text](url)` → link entity; `![alt](media:LOCAL_ID)` → atomic + image entity using uploaded ids from `opts.images`. Strip unsupported markdown rather than failing.

- [ ] **Step 3: Run PASS + commit**

```bash
git add src/lib/compose/article-draftjs.ts src/lib/compose/article-draftjs.test.ts
git commit -m "feat(compose): convert article markdown to DraftJS content_state"
```

---

### Task 7: Media upload API (`/api/x/media`)

**Files:**
- Create: `api/x/media.ts`
- Create: `src/lib/compose/x-media-client.ts`
- Mirror session pattern from `api/x/post.ts`

- [ ] **Step 1: Server handler**

`POST /api/x/media` JSON body: `{ dataUrl: string, mediaCategory?: 'tweet_image' }`  
Decode base64 data URL → multipart `POST ${X_API_BASE}/media/upload` with `media_category=tweet_image` (or docs’ `TWEET_IMAGE` / `tweet_image` as required by live API — verify against X error messages in integration).  
Return `{ mediaId: string, mediaKey?: string }`.

Reuse `resolveSession` / cookie refresh exactly like `api/x/post.ts`.

- [ ] **Step 2: Browser client**

```ts
export async function uploadImageDataUrl(dataUrl: string): Promise<{ mediaId: string; mediaKey?: string }> {
  const res = await fetch('/api/x/media', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, mediaCategory: 'tweet_image' }),
  })
  // map errors like x-post-client (x_not_connected, needsReconnect)
  ...
}
```

- [ ] **Step 3: Unit-test pure helpers** (dataUrl → bytes) if extracted; skip live X call in CI.

- [ ] **Step 4: Commit**

```bash
git add api/x/media.ts src/lib/compose/x-media-client.ts
git commit -m "feat(x): add image media upload proxy for compose"
```

---

### Task 8: Articles publish API + client

**Files:**
- Create: `api/x/articles.ts`
- Create: `src/lib/compose/x-article-client.ts`
- Modify: `src/lib/compose/postability.ts`
- Modify: `src/components/compose/compose-actions.tsx`
- Set `CAPS.mediaNativeSupported` considerations for article media (articles path uploads itself)

- [ ] **Step 1: `api/x/articles.ts`**

Body:

```ts
{
  title: string
  content_state: DraftJsContentState
  cover_media?: { media_category: string; media_id: string }
}
```

Flow:
1. `POST ${X_API_BASE}/articles/draft`
2. `POST ${X_API_BASE}/articles/${id}/publish`
3. Return `{ id: articleId, postId, url: postUrl(postId) }`

- [ ] **Step 2: `publishArticleDraft(draft)` client**

1. Upload cover + each `inlineMedia` dataUrl via `uploadImageDataUrl`; build `images` map keyed by local media id  
2. Ensure body references `![…](media:localId)` for inlines (or auto-append atomic blocks from `inlineMedia` in converter opts)  
3. `markdownToContentState(body, { images })`  
4. `POST /api/x/articles`

- [ ] **Step 3: Postability**

```ts
export function classifyPostability(draft: PostDraft, caps: PostabilityCaps): Postability {
  if (resolveDraftFormat(draft) === 'article') {
    const hasMedia =
      Boolean(draft.article?.cover?.dataUrl) ||
      (draft.article?.inlineMedia.some((m) => m.dataUrl) ?? false)
    // Articles always go through articles API when connected; media is uploaded in that path.
    return { mode: 'api' } // compose-actions still requires connected
  }
  // existing reply/quote/media logic for segments…
}
```

For article with only text: `mode: 'api'`.  
Button label: `Publish article`.

- [ ] **Step 4: Wire `compose-actions` post()**

```ts
if (resolveDraftFormat(draft) === 'article') {
  const result = await publishArticleDraft(draft)
  ...
} else {
  const result = await postDraft(...)
}
```

Copy still uses `serializeDraftForCopy`.

- [ ] **Step 5: Commit**

```bash
git add api/x/articles.ts src/lib/compose/x-article-client.ts src/lib/compose/postability.ts src/lib/compose/postability.test.ts src/components/compose/compose-actions.tsx
git commit -m "feat(compose): publish X Articles with uploaded media"
```

---

### Task 9: Verification + docs touch-up

- [ ] **Step 1: Run focused suites**

```bash
npx vitest run src/lib/compose/serialize.test.ts src/lib/compose/format.test.ts src/lib/compose/compose-prompt.test.ts src/lib/compose/article-draftjs.test.ts src/lib/compose/postability.test.ts
```

Expected: all PASS

- [ ] **Step 2: Manual checklist**

1. Copy draft containing bare snowflake → clipboard has `https://x.com/i/status/…`  
2. Reply draft copy includes target URL  
3. Format preference Auto → Article persists after reload  
4. Model prompt (devtools / log) contains format rules  
5. Article title/body → Publish (connected Premium account) or clear error + Copy fallback  

- [ ] **Step 3: Final commit if any fixes**

```bash
git commit -m "fix(compose): harden format modes and article publish edge cases"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `preferredFormat` auto default + persist | 3 |
| Format definitions / resolve order | 2 |
| Selector in settings + drawer | 3 |
| Model teaching + preference inject | 4 |
| postdraft / writer schema | 4 |
| Draft body permalinks teaching | 4 |
| Copy ID→URL + reply/quote append | 1 |
| Article fields + drawer | 5 |
| Markdown → DraftJS | 6 |
| Media upload | 7 |
| Articles draft + publish | 8 |
| Postability / actions | 8 |
| Tests listed in spec | 1,2,4,6,8,9 |

## Out of scope (do not implement in this plan)

- WYSIWYG DraftJS editor  
- Polls in Articles  
- Tiered free/basic/premium selector options  
- Chat `^1^` web-citation chips  

---

## Self-review notes

- Types: `PreferredFormat` / `ArticleDraft` / `DraftJsContentState` names are consistent across tasks.  
- Task 1 may introduce a thin `article` stub; Task 2/5 expand to full `ArticleDraft` with `inlineMedia`.  
- No TBD placeholders. Media category enum must match live X (`tweet_image` vs `TWEET_IMAGE`) — Task 7 verifies against API errors.

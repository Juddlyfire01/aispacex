# Compose Format Modes + Article Publish + Copy Permalinks

**Date:** 2026-07-11  
**Status:** Approved (Approach 2 — unified format mode)

## Goal

Teach compose models the difference between a **post**, **thread**, **long-form post** (Premium), and **Article**; let the user set a preferred format that defaults to **Auto** (model decides) and **persists** when overridden; support full **Articles API** publish with media; and make **Copy to X** emit real post permalinks instead of bare snowflake ids.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Architecture | Unified format mode on compose (Approach 2) — not a separate Article app surface |
| Preferred format values | `auto` \| `post` \| `thread` \| `longform` \| `article` |
| Default | `auto` — model chooses; user override persists in compose store |
| Tier display | Not separate selector options — Post/Long-form limits follow connected account verified/Premium status |
| Article v1 | Full path: draft → media upload → `POST /2/articles/draft` → `POST /2/articles/{id}/publish` |
| Article authoring | Title + markdown/plain body converted to DraftJS `content_state`; cover + inline images (rich DraftJS editor later) |
| Copy permalinks | Rewrite bare/`post:` ids in body **and** append reply/quote target permalinks |
| Visual companion | Skipped (text-only design) |

## Format definitions (models + UI)

| Format | Shape | Limits / notes |
|--------|--------|----------------|
| **Post** | Single segment, `longform: false` | Target ≤280 (standard post). Do not treat as Premium long-form. |
| **Thread** | Two or more segments | Per-segment 280 unless a segment is explicitly long-form-capable; intentional multi-beat only |
| **Long-form** | Single segment, `longform: true` | Up to `LONGFORM_LIMIT` (25 000); native post requires verified/Premium |
| **Article** | `draft.article` payload (not tweet segments) | X Articles API; title, rich body, cover + inline media, embeddable posts/links |

**Auto:** model picks among the four using prompt decision rules. UI does not force segment count.

**Resolved format** for the current draft (derived for drawer consistency):

1. Non-empty `article` (title or body present) → `article`
2. `segments.length > 1` → `thread`
3. `longform === true` (single segment) → `longform`
4. else → `post`

Clear or ignore stale `article` when the user/model switches to a non-article shape so resolution stays unambiguous.

## Data model

### Store (persisted)

```ts
preferredFormat: 'auto' | 'post' | 'thread' | 'longform' | 'article'  // default 'auto'
```

Migrate compose persist version to backfill `preferredFormat: 'auto'`.

Existing `longformPreference` remains the verified long-form **capability toggle** (can this account use >280). Preferred format is the **output shape** preference; when format is `longform` or Auto chooses long-form, clamp with verification helpers as today.

### `PostDraft` extensions

Keep `segments`, `target`, `longform`, media on segments.

Add optional:

```ts
article?: {
  title: string
  /** Source markdown/plain used for editing; converted to DraftJS on publish. */
  bodyMarkdown: string
  /** Cached DraftJS content state (optional; regenerate from markdown if stale). */
  contentState?: DraftJsContentState
  cover?: MediaItem
  inlineMedia: MediaItem[]
}
```

When resolved format is `article`, Post/Publish uses the Articles path; segment UI can hide or show a read-only stub — drawer switches to article fields (title, body, cover, inline media).

## UI

### Preference selector

- Compose settings: pill group `Auto · Post · Thread · Long-form · Article`
- Draft drawer: same control (override without leaving composer)
- Changing either updates `preferredFormat` immediately (persists)

### Gating

- Long-form / Article always visible in the selector
- Native Post/Publish for long-form or Article: warn or fall back to Copy if account isn’t verified / Articles unavailable / X disconnected
- Auto: no gate

### Article drawer (v1)

- Title input
- Body textarea (markdown/plain)
- Cover image attach
- Inline image attaches (same media picker patterns as segments where practical)
- Character/structure guidance for Articles (not the 280 ring)

## Model teaching

### Prompts (`compose-prompt`, draft-writer)

Document the four formats and decision rules for Auto.

Inject preference:

- If `preferredFormat !== 'auto'`: *User prefers **{format}** — produce that shape unless they explicitly ask otherwise this turn.*
- If `auto`: single punchy take → post; multi-beat → thread; deep single essay → long-form when Premium-capable; titled structured piece with sections/media → article.

### Schema

- Same-model `postdraft`: optional `format` + optional `article: { title, bodyMarkdown, … }`
- Handoff `compose_write_draft`: pass `preferredFormat`; writer may return article-shaped output when relevant (title + body + `---` conventions or structured fields as planned in implementation)

### Citation style in drafts

For **publishable draft body**, models should use permalinks (`https://x.com/i/status/{id}`) when citing external posts. Chat replies may still use bare ids / `post:` for UI linking. Serialize rewrites leftovers on copy.

## Articles publish path

New server route (preferred: `POST /api/x/articles`) or carefully extended `/api/x/post` with a format discriminator.

Flow:

1. Upload cover + inline media via X media upload → `media_id`s  
2. Convert `bodyMarkdown` (+ entity refs) → DraftJS `content_state` (blocks + `link` / `image` / `post` entities)  
3. `POST https://api.x.com/2/articles/draft` with `title`, `content_state`, optional `cover_media`  
4. `POST https://api.x.com/2/articles/{article_id}/publish` → seed `post_id` / URL for “View on X”

Auth: user OAuth with `tweet.read`, `tweet.write`, `users.read` (per X Articles docs).

Shared media upload helper should also unlock flipping `mediaNativeSupported` for ordinary posts/threads once proven (same upload pipeline).

Failures: clear error + Copy fallback with serialized article text.

## Copy to X (`serializeDraftForCopy`)

1. Rewrite bare snowflakes and `post:…` in segment/article text → `https://x.com/i/status/{id}`  
   - Skip ids already inside URLs  
   - Reuse `POST_ID_RE` / `normalizePostId` / `postUrl` from `evidence.ts`
2. If `target` is reply or quote, append a line with the target permalink (include `@username` when available)
3. Threads: keep `1/N` numbering after rewrite  
4. Articles: serialize as title + body (URLs rewritten); include cover/media notes only if useful for manual paste (implementation may omit binary media from clipboard)

Reply/quote remain copy-first under existing PAYG rules where applicable; copy now includes the target URL so manual paste/navigation is usable.

## Postability

| Draft | Native path | Else |
|-------|-------------|------|
| Post / thread / long-form (text) | Existing `/api/x/post` | Copy |
| With media | API once media upload wired; else Copy | Copy |
| Article | `/api/x/articles` | Copy |
| Reply / quote | Copy (existing) with target URL in clipboard | — |

## Out of scope (v1)

- Full WYSIWYG DraftJS editor
- Polls inside Articles
- Separating free/basic/premium as distinct selector options
- Changing chat markdown citation rendering (`^1^` / web search chips) — separate concern

## Testing

- Store migrate + `preferredFormat` persistence
- Prompt injection for auto vs forced format
- `serializeDraftForCopy`: id → URL; skip existing URLs; reply/quote append
- Markdown → DraftJS converter smoke (headers, lists, links, image entities)
- Articles client request shape (draft + publish) with mocked fetch
- Postability matrix for article vs thread vs media

## Key files (expected touchpoints)

- `src/lib/compose/types.ts` — article fields, format type
- `src/stores/compose-store.ts` — `preferredFormat`
- `src/components/compose/compose-settings.tsx`, draft drawer — selector
- `src/lib/compose/compose-prompt.ts`, `draft-writer.ts`, `draft-writer-tool.ts`, `draft-block.ts`
- `src/lib/compose/serialize.ts` — permalink rewrite
- `src/lib/compose/article-draftjs.ts` (new) — markdown ↔ content_state
- `src/lib/compose/x-article-client.ts` (new), `api/x/articles.ts` (new), media upload helper
- `src/lib/compose/postability.ts`, `compose-actions.tsx`

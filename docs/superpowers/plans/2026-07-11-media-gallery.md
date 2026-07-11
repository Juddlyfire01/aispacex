# Media Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist image and video generations in a shared IndexedDB gallery with the same simple grid + lightbox UX, including delete/clear and metadata.

**Architecture:** `media-gallery.ts` owns IndexedDB CRUD + soft caps; `useMediaGallery(kind)` exposes object URLs and mutations; `MediaGallery` renders the shared grid/lightbox; `image-view` and `video-view` add completed results into the store instead of replacing ephemeral state.

**Tech Stack:** React, TypeScript, IndexedDB (native), Vitest, existing `GenerationView`

**Spec:** `docs/superpowers/specs/2026-07-11-media-gallery-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/media-gallery.ts` | IDB open/CRUD, soft caps, list by kind |
| `src/lib/media-gallery.test.ts` | Store unit tests (in-memory fake) |
| `src/lib/media-blob.ts` | base64 / data-URL / remote URL → Blob helpers |
| `src/lib/media-blob.test.ts` | Helper unit tests |
| `src/hooks/use-media-gallery.ts` | Load kind, object URLs, add/remove/clear |
| `src/components/media/media-gallery.tsx` | Grid, lightbox, header, download/delete/clear |
| `src/components/image/image-view.tsx` | Wire gallery; drop `images` state |
| `src/components/video/video-view.tsx` | Wire gallery; replace single-player output |
| `src/hooks/use-video.ts` | Return completed blob; don’t wipe gallery lifetime |

---

### Task 1: Media blob helpers

**Files:**
- Create: `src/lib/media-blob.ts`
- Create: `src/lib/media-blob.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { blobFromBase64, extensionForMime, mimeFromBase64 } from './media-blob'

describe('mimeFromBase64', () => {
  it('detects png/jpeg/webp prefixes and data URLs', () => {
    expect(mimeFromBase64('iVBOR')).toBe('image/png')
    expect(mimeFromBase64('/9j/')).toBe('image/jpeg')
    expect(mimeFromBase64('UklGR')).toBe('image/webp')
    expect(mimeFromBase64('data:image/png;base64,aaa')).toBe('image/png')
  })
})

describe('blobFromBase64', () => {
  it('returns a Blob with the detected mime type', async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const blob = blobFromBase64(b64)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe('extensionForMime', () => {
  it('maps common mime types', () => {
    expect(extensionForMime('image/png')).toBe('png')
    expect(extensionForMime('image/jpeg')).toBe('jpg')
    expect(extensionForMime('video/mp4')).toBe('mp4')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/media-blob.test.ts`

- [ ] **Step 3: Implement helpers**

```ts
export function mimeFromBase64(b64: string): string {
  if (b64.startsWith('data:')) {
    const m = /^data:([^;]+);/.exec(b64)
    return m?.[1] ?? 'application/octet-stream'
  }
  if (b64.startsWith('/9j/')) return 'image/jpeg'
  if (b64.startsWith('iVBOR')) return 'image/png'
  if (b64.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}

export function blobFromBase64(b64: string): Blob {
  const mime = mimeFromBase64(b64)
  const raw = b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64
  const binary = atob(raw)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function extensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/png') return 'png'
  if (mime.startsWith('video/')) return 'mp4'
  return 'bin'
}

export async function blobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch media (${res.status})`)
  return res.blob()
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/media-blob.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/media-blob.ts src/lib/media-blob.test.ts
git commit -m "feat(media): add base64/url blob helpers for gallery"
```

---

### Task 2: IndexedDB media gallery store

**Files:**
- Create: `src/lib/media-gallery.ts`
- Create: `src/lib/media-gallery.test.ts`

- [ ] **Step 1: Write failing tests with an injectable DB backend**

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import {
  MEDIA_CAPS,
  createMediaGalleryStore,
  type MediaGalleryItemInput,
  type MediaGalleryBackend,
  type MediaGalleryRecord,
} from './media-gallery'

function memoryBackend(): MediaGalleryBackend {
  const map = new Map<string, MediaGalleryRecord>()
  return {
    async getAll() { return [...map.values()] },
    async put(record) { map.set(record.id, record) },
    async delete(id) { map.delete(id) },
    async clear() { map.clear() },
  }
}

function input(partial: Partial<MediaGalleryItemInput> & { kind: 'image' | 'video' }): MediaGalleryItemInput {
  return {
    kind: partial.kind,
    blob: partial.blob ?? new Blob(['x'], { type: 'image/png' }),
    mimeType: partial.mimeType ?? 'image/png',
    prompt: partial.prompt ?? 'a test prompt',
    model: partial.model ?? 'test-model',
    negativePrompt: partial.negativePrompt,
    extras: partial.extras,
  }
}

describe('media gallery store', () => {
  let store: ReturnType<typeof createMediaGalleryStore>

  beforeEach(() => {
    store = createMediaGalleryStore(memoryBackend())
  })

  it('adds and lists newest-first for a kind', async () => {
    const a = await store.add(input({ kind: 'image', prompt: 'first' }))
    await new Promise((r) => setTimeout(r, 2))
    const b = await store.add(input({ kind: 'image', prompt: 'second' }))
    const list = await store.list('image')
    expect(list.map((i) => i.id)).toEqual([b.id, a.id])
  })

  it('scopes list and clearAll by kind', async () => {
    await store.add(input({ kind: 'image' }))
    await store.add(input({ kind: 'video', mimeType: 'video/mp4' }))
    expect((await store.list('image')).length).toBe(1)
    await store.clearAll('image')
    expect((await store.list('image')).length).toBe(0)
    expect((await store.list('video')).length).toBe(1)
  })

  it('removes a single item', async () => {
    const item = await store.add(input({ kind: 'image' }))
    await store.remove(item.id)
    expect(await store.list('image')).toEqual([])
  })

  it('evicts oldest when over soft cap', async () => {
    const cap = MEDIA_CAPS.image
    const ids: string[] = []
    for (let i = 0; i < cap + 2; i++) {
      const item = await store.add(input({ kind: 'image', prompt: `p${i}` }))
      ids.push(item.id)
      await new Promise((r) => setTimeout(r, 1))
    }
    const list = await store.list('image')
    expect(list.length).toBe(cap)
    expect(list.map((i) => i.id)).not.toContain(ids[0])
    expect(list.map((i) => i.id)).toContain(ids[ids.length - 1])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/media-gallery.test.ts`

- [ ] **Step 3: Implement store + IndexedDB backend**

Implement `createMediaGalleryStore(backend)`, `MEDIA_CAPS`, `createIdbMediaBackend()`, and `export const mediaGallery = createMediaGalleryStore(createIdbMediaBackend())`.

IDB: DB name `aispacex-media-gallery`, object store `items`, keyPath `id`. Use Promise wrappers matching `device-crypto.ts` style.

Soft-cap eviction: before put, list same kind oldest-first; delete overflow oldest; then put new record.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/media-gallery.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/media-gallery.ts src/lib/media-gallery.test.ts
git commit -m "feat(media): add IndexedDB gallery store with soft caps"
```

---

### Task 3: `useMediaGallery` hook

**Files:**
- Create: `src/hooks/use-media-gallery.ts`

- [ ] **Step 1: Implement hook**

```ts
export interface GalleryItemView extends MediaGalleryRecord {
  objectUrl: string
}

export function useMediaGallery(kind: MediaKind) {
  // Load list(kind) on mount; createObjectURL each
  // add(input) → store.add → prepend view
  // remove(id) → revoke + store.remove
  // clearAll() → revoke all + store.clearAll(kind)
  // unmount → revoke all
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-media-gallery.ts
git commit -m "feat(media): add useMediaGallery hook with object URL lifecycle"
```

---

### Task 4: Shared `MediaGallery` UI

**Files:**
- Create: `src/components/media/media-gallery.tsx`

- [ ] **Step 1: Build component**

Props: `kind`, `items`, `pendingCount?`, `empty`, `onUsePrompt?`, `onRemove`, `onClearAll`.

Match image grid density. Header with count + Clear all (`window.confirm`). Hover Download + Delete. Lightbox with metadata + Use prompt. Download via `extensionForMime`.

- [ ] **Step 2: Commit**

```bash
git add src/components/media/media-gallery.tsx
git commit -m "feat(media): add shared gallery grid and lightbox"
```

---

### Task 5: Wire image view

**Files:**
- Modify: `src/components/image/image-view.tsx`

- [ ] **Step 1: Replace ephemeral `images` state with `useMediaGallery('image')` + `MediaGallery`**
- [ ] **Step 2: On success, `blobFromBase64` each variant and `gallery.add(...)`**
- [ ] **Step 3: Commit**

```bash
git add src/components/image/image-view.tsx
git commit -m "feat(image): persist generations in shared media gallery"
```

---

### Task 6: Video hook returns blob without wiping gallery

**Files:**
- Modify: `src/hooks/use-video.ts`

- [ ] **Step 1: Expose `completedBlob`; fetch VPS URL into Blob; on new queue clear job blob only (no gallery revoke)**
- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-video.ts
git commit -m "feat(video): expose completed blob and stop wiping prior results"
```

---

### Task 7: Wire video view gallery

**Files:**
- Modify: `src/components/video/video-view.tsx`

- [ ] **Step 1: `useMediaGallery('video')`; on `completedBlob` add to gallery; replace single-player output with `MediaGallery`**
- [ ] **Step 2: Commit**

```bash
git add src/components/video/video-view.tsx
git commit -m "feat(video): show persistent gallery of generated videos"
```

---

### Task 8: Verification

- [ ] **Step 1:** `npx vitest run src/lib/media-blob.test.ts src/lib/media-gallery.test.ts` — PASS
- [ ] **Step 2:** `npx tsc --noEmit` — clean for touched files

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Shared IDB store | 2 |
| Soft caps 50/20 | 2 |
| Object URL lifecycle | 3 |
| Grid + lightbox + metadata + Use prompt | 4 |
| Delete + Clear all | 4 |
| Image wire-up | 5 |
| Video blob persist (incl. VPS fetch) | 6–7 |
| Don’t wipe on new generate | 6–7 |

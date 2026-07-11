# Media Gallery (Image + Video Persistence)

**Date:** 2026-07-11  
**Status:** Approved (Approach 1 — shared media gallery store)

## Goal

Stop losing prior generations when a new image or video job starts. Keep the simple in-pane grid + lightbox UX from today’s image gallery, add IndexedDB persistence so items survive refresh / tab switches, and wire both Image Generate and Video to one shared gallery backend.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Architecture | Shared IndexedDB gallery (`kind: 'image' \| 'video'`) + one React hook |
| Persistence | IndexedDB blobs + metadata (survive refresh) |
| Delete UX | Hover trash per item + Clear all (with confirm) |
| Metadata | Prompt, model, createdAt shown in lightbox; “Use prompt” fills the form |
| Soft caps | Newest 50 images / 20 videos per kind; oldest dropped on add when over cap |
| Layout | Stay in `GenerationView` output pane (not a separate Gallery route) |
| Image tools | Out of scope for v1 (still single-result) |
| Music / audio | Out of scope |
| Visual companion | Skipped (text-only design) |

## Architecture

```
image-view / video-view
        ↓
useMediaGallery(kind)     // list, add, remove, clearAll, objectUrls
        ↓
media-gallery.ts          // IndexedDB: records + Blob store
```

### Data model

```ts
interface MediaGalleryItem {
  id: string                 // uuid
  kind: 'image' | 'video'
  blob: Blob
  mimeType: string
  prompt: string
  negativePrompt?: string
  model: string
  createdAt: number          // epoch ms
  /** Sparse optional params (aspect, duration, resolution, style, …) */
  extras?: Record<string, string | number | boolean>
}
```

Display layer never holds raw base64 long-term. On load / add, the hook creates an `objectUrl` per item and revokes it on delete / unmount / clear.

### Soft caps

| Kind | Max items |
|------|-----------|
| `image` | 50 |
| `video` | 20 |

When `add` would exceed the cap, delete oldest records (and revoke their object URLs) until under cap, then insert the new item(s). Newest-first listing.

### IndexedDB

- DB name: `aispacex-media-gallery`
- Store: `items` (keyPath `id`)
- Indexes: `by-kind` (`kind`), `by-kind-created` (`[kind, createdAt]`)
- Native `Blob` values in records (supported in modern Chromium / Firefox / Safari)

Reuse patterns from `src/lib/device-crypto.ts` for open/get/put/delete wrappers — separate DB, no encryption required for media blobs in v1 (same origin threat model as other local app data).

## UX

### Grid (both kinds)

- Newest first
- Skeletons while a generate is in flight (image: N = variants; video: 1)
- Hover: Download + Delete
- Non-empty header: item count + Clear all (browser `confirm`)
- Click tile → lightbox

### Tiles

- **Image:** `<img>` thumbnail (current look)
- **Video:** muted `<video preload="metadata">` showing first frame; no autoplay in grid

### Lightbox

- Backdrop click closes
- Download + Close actions
- Metadata strip: model · relative time · full prompt (truncated with expand)
- **Use prompt** — sets the form prompt (and negative prompt when present)

### Empty / in-flight

- Image empty: example prompts (unchanged)
- Video empty: existing empty copy
- If gallery already has items and a job is running: skeletons prepend above existing tiles; do not hide the gallery

### Image tools tab

Unchanged single-result flow. Not written into the gallery in v1.

## Data flow

### Image generate

1. `POST /image/generate` returns base64 / `b64_json` variants.
2. Convert each to a `Blob` (`data:` or raw base64 → typed blob).
3. `gallery.add({ kind: 'image', blob, mimeType, prompt, negativePrompt, model, extras })` for each variant (newest batch first).
4. Remove session-only `useState<string[]>` image list.

### Video generate

1. Queue + poll as today (`use-video`).
2. On complete:
   - Binary retrieve → already a `Blob`
   - VPS `download_url` → **fetch** into a `Blob` (do not persist remote URL; `delete_media_on_completion` makes it ephemeral)
3. `gallery.add({ kind: 'video', blob, mimeType: 'video/mp4', prompt, … })`
4. Hook keeps job status for the in-flight UI; **does not** clear prior gallery items on new queue.
5. Stop revoking the previous result blob on new queue / reset — gallery owns blob lifetime. `cancel` / `reset` only reset job state.

### Object URL hygiene

- Create URL when item enters the in-memory list
- Revoke on: item delete, clearAll, hook unmount, eviction for soft cap

## Error handling

- IDB open / write failure → toast + keep in-memory fallback for the current session only (still show the new item); log to console
- Video remote fetch failure after COMPLETED → surface error; do not add a broken gallery entry
- Clear all / delete are best-effort; UI updates optimistically then syncs IDB

## Testing

- Unit: `media-gallery.ts` — add / list / delete / clearAll / soft-cap eviction (fake IndexedDB or in-memory test double)
- Unit: base64 / data-URL → Blob helpers
- Component-level optional later; not required for v1 if hook + store are covered

## Out of scope

- Dedicated Gallery route / cross-media browser
- Music, TTS, image tools history
- Cross-device sync / export zip
- Encrypted media at rest
- Settings UI for caps
- Re-run full generation from metadata (only “Use prompt”)

## Files (expected)

| Path | Role |
|------|------|
| `src/lib/media-gallery.ts` | IDB CRUD + caps |
| `src/lib/media-gallery.test.ts` | Store tests |
| `src/hooks/use-media-gallery.ts` | React binding + object URLs |
| `src/components/media/media-gallery.tsx` | Shared grid + lightbox + header |
| `src/components/image/image-view.tsx` | Wire gallery; drop ephemeral array |
| `src/components/video/video-view.tsx` | Wire gallery; replace single-player output |
| `src/hooks/use-video.ts` | Don’t wipe prior URLs; return blob/URL for add |

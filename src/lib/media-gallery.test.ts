import { beforeEach, describe, expect, it } from 'vitest'
import {
  MEDIA_CAPS,
  createMediaGalleryStore,
  type MediaGalleryBackend,
  type MediaGalleryItemInput,
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

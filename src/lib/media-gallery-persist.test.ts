import { describe, expect, it, vi, beforeEach } from 'vitest'
import { persistGeneratedMedia, onMediaGalleryChange } from './media-gallery-persist'

vi.mock('./media-gallery', () => ({
  mediaGallery: {
    add: vi.fn(async (input: { kind: string }) => ({
      ...input,
      id: 'id-1',
      createdAt: 1,
    })),
  },
}))

vi.mock('../stores/toast-store', () => ({
  toast: { error: vi.fn() },
}))

describe('persistGeneratedMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes via mediaGallery and notifies listeners', async () => {
    const seen: string[] = []
    const unsub = onMediaGalleryChange((kind) => {
      seen.push(kind)
    })
    const record = await persistGeneratedMedia({
      kind: 'image',
      blob: new Blob(['x'], { type: 'image/png' }),
      mimeType: 'image/png',
      prompt: 'hi',
      model: 'm',
    })
    expect(record?.id).toBe('id-1')
    expect(seen).toEqual(['image'])
    unsub()
  })
})

export const MEDIA_CAPS = { image: 50, video: 20 } as const

export type MediaKind = 'image' | 'video'

export interface MediaGalleryRecord {
  id: string
  kind: MediaKind
  blob: Blob
  mimeType: string
  prompt: string
  negativePrompt?: string
  model: string
  createdAt: number
  extras?: Record<string, string | number | boolean>
}

export type MediaGalleryItemInput = Omit<MediaGalleryRecord, 'id' | 'createdAt'>

export interface MediaGalleryBackend {
  getAll(): Promise<MediaGalleryRecord[]>
  put(record: MediaGalleryRecord): Promise<void>
  delete(id: string): Promise<void>
  clear(): Promise<void>
}

export function createMediaGalleryStore(backend: MediaGalleryBackend) {
  return {
    async add(input: MediaGalleryItemInput): Promise<MediaGalleryRecord> {
      const record: MediaGalleryRecord = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      }
      const existing = (await backend.getAll())
        .filter((r) => r.kind === input.kind)
        .sort((a, b) => a.createdAt - b.createdAt)
      const cap = MEDIA_CAPS[input.kind]
      const overflow = existing.length + 1 - cap
      if (overflow > 0) {
        for (const old of existing.slice(0, overflow)) {
          await backend.delete(old.id)
        }
      }
      await backend.put(record)
      return record
    },

    async list(kind: MediaKind): Promise<MediaGalleryRecord[]> {
      return (await backend.getAll())
        .filter((r) => r.kind === kind)
        .sort((a, b) => b.createdAt - a.createdAt)
    },

    async remove(id: string): Promise<void> {
      await backend.delete(id)
    },

    async clearAll(kind: MediaKind): Promise<void> {
      const items = (await backend.getAll()).filter((r) => r.kind === kind)
      for (const item of items) await backend.delete(item.id)
    },
  }
}

const DB_NAME = 'aispacex-media-gallery'
const STORE_NAME = 'items'
const DB_VERSION = 1

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open media gallery DB'))
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export function createIdbMediaBackend(): MediaGalleryBackend {
  return {
    async getAll() {
      const db = await openMediaDb()
      try {
        const tx = db.transaction(STORE_NAME, 'readonly')
        return await idbReq(tx.objectStore(STORE_NAME).getAll()) as MediaGalleryRecord[]
      } finally {
        db.close()
      }
    },
    async put(record) {
      const db = await openMediaDb()
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        await idbReq(tx.objectStore(STORE_NAME).put(record))
      } finally {
        db.close()
      }
    },
    async delete(id) {
      const db = await openMediaDb()
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        await idbReq(tx.objectStore(STORE_NAME).delete(id))
      } finally {
        db.close()
      }
    },
    async clear() {
      const db = await openMediaDb()
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        await idbReq(tx.objectStore(STORE_NAME).clear())
      } finally {
        db.close()
      }
    },
  }
}

export const mediaGallery = createMediaGalleryStore(createIdbMediaBackend())

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MEDIA_CAPS,
  mediaGallery,
  type MediaGalleryItemInput,
  type MediaGalleryRecord,
  type MediaKind,
} from '../lib/media-gallery'
import { toast } from '../stores/toast-store'

export interface GalleryItemView extends MediaGalleryRecord {
  objectUrl: string
}

function toView(record: MediaGalleryRecord): GalleryItemView {
  return { ...record, objectUrl: URL.createObjectURL(record.blob) }
}

export function useMediaGallery(kind: MediaKind) {
  const [items, setItems] = useState<GalleryItemView[]>([])
  const [ready, setReady] = useState(false)
  const urlsRef = useRef<Map<string, string>>(new Map())

  const revokeAll = useCallback(() => {
    for (const url of urlsRef.current.values()) URL.revokeObjectURL(url)
    urlsRef.current.clear()
  }, [])

  const track = useCallback((views: GalleryItemView[]) => {
    revokeAll()
    for (const v of views) urlsRef.current.set(v.id, v.objectUrl)
    setItems(views)
  }, [revokeAll])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const records = await mediaGallery.list(kind)
        if (cancelled) return
        track(records.map(toView))
      } catch (err) {
        console.error('Failed to load media gallery', err)
        toast.error('Gallery unavailable', 'Could not load saved media from this browser.')
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
      revokeAll()
    }
  }, [kind, revokeAll, track])

  const add = useCallback(async (input: MediaGalleryItemInput) => {
    try {
      const record = await mediaGallery.add(input)
      const view = toView(record)
      urlsRef.current.set(view.id, view.objectUrl)
      setItems((prev) => {
        // Soft-cap may have evicted oldest in the store — drop matching local views
        const next = [view, ...prev.filter((p) => p.id !== view.id)]
        const cap = MEDIA_CAPS[input.kind]
        while (next.length > cap) {
          const dropped = next.pop()
          if (dropped) {
            const url = urlsRef.current.get(dropped.id)
            if (url) {
              URL.revokeObjectURL(url)
              urlsRef.current.delete(dropped.id)
            }
          }
        }
        return next
      })
      return view
    } catch (err) {
      console.error('Failed to save media', err)
      // Session fallback: still show the item even if IDB write failed
      const fallback: GalleryItemView = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        objectUrl: URL.createObjectURL(input.blob),
      }
      urlsRef.current.set(fallback.id, fallback.objectUrl)
      setItems((prev) => [fallback, ...prev])
      toast.error('Not saved', 'Showing this generation for the session only.')
      return fallback
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    const url = urlsRef.current.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      urlsRef.current.delete(id)
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
    try {
      await mediaGallery.remove(id)
    } catch (err) {
      console.error('Failed to delete media', err)
      toast.error('Delete failed', 'Removed from view but may still be on disk.')
    }
  }, [])

  const clearAll = useCallback(async () => {
    revokeAll()
    setItems([])
    try {
      await mediaGallery.clearAll(kind)
    } catch (err) {
      console.error('Failed to clear media gallery', err)
      toast.error('Clear failed', 'Gallery may still have items on disk.')
    }
  }, [kind, revokeAll])

  return { items, ready, add, remove, clearAll }
}

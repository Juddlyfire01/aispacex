// Durable media gallery writes that survive view unmount.
// Generation hooks MUST persist here (then charge) — never only in React
// onSuccess/effects, or navigating away drops the result while still billing.

import {
  mediaGallery,
  type MediaGalleryItemInput,
  type MediaGalleryRecord,
  type MediaKind,
} from './media-gallery'
import { toast } from '../stores/toast-store'

type Listener = (kind: MediaKind) => void

const listeners = new Set<Listener>()

/** Subscribe to gallery mutations (add/remove/clear). Returns unsubscribe. */
export function onMediaGalleryChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyMediaGalleryChange(kind: MediaKind): void {
  for (const listener of listeners) {
    try {
      listener(kind)
    } catch (err) {
      console.error('media gallery listener failed', err)
    }
  }
}

/**
 * Persist a generated media item to IndexedDB and notify live gallery hooks.
 * Safe to call from hooks / pollers after the component has unmounted.
 */
export async function persistGeneratedMedia(
  input: MediaGalleryItemInput,
  opts: { silent?: boolean } = {},
): Promise<MediaGalleryRecord | null> {
  try {
    const record = await mediaGallery.add(input)
    notifyMediaGalleryChange(input.kind)
    return record
  } catch (err) {
    console.error('Failed to persist generated media', err)
    if (!opts.silent) {
      toast.error(
        'Not saved to gallery',
        'Generation finished but could not write to this browser’s storage.',
      )
    }
    return null
  }
}

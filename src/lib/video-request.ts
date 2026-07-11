import type { VideoQueueRequest } from '../types/venice'

/** R2V / reference-to-video models require reference_image_urls, not image_url. */
export function isReferenceToVideoModel(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return id.includes('reference-to-video') || id.includes('-r2v') || id.includes('_r2v')
}

/** Attach a single reference image using the field the model expects. */
export function attachVideoReferenceImage(
  req: VideoQueueRequest,
  modelId: string,
  imageUrl: string,
): VideoQueueRequest {
  if (isReferenceToVideoModel(modelId)) {
    req.reference_image_urls = [imageUrl]
  } else {
    req.image_url = imageUrl
  }
  return req
}

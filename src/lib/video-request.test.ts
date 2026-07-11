import { describe, expect, it } from 'vitest'
import { attachVideoReferenceImage, isReferenceToVideoModel } from './video-request'
import type { VideoQueueRequest } from '../types/venice'

describe('isReferenceToVideoModel', () => {
  it('detects reference-to-video ids', () => {
    expect(isReferenceToVideoModel('grok-imagine-reference-to-video-private')).toBe(true)
    expect(isReferenceToVideoModel('kling-o3-pro-reference-to-video')).toBe(true)
    expect(isReferenceToVideoModel('wan-2-7-reference-to-video')).toBe(true)
  })

  it('detects r2v slug variants', () => {
    expect(isReferenceToVideoModel('seedance-2-0-r2v')).toBe(true)
    expect(isReferenceToVideoModel('foo_r2v_bar')).toBe(true)
  })

  it('rejects classical image-to-video ids', () => {
    expect(isReferenceToVideoModel('grok-imagine-image-to-video-private')).toBe(false)
    expect(isReferenceToVideoModel('kling-2.6-pro-image-to-video')).toBe(false)
    expect(isReferenceToVideoModel('wan-2-7-text-to-video')).toBe(false)
  })
})

describe('attachVideoReferenceImage', () => {
  const base = (): VideoQueueRequest => ({
    model: 'x',
    prompt: 'camera pans slowly across the scene',
  })

  it('sets reference_image_urls for R2V models', () => {
    const req = attachVideoReferenceImage(
      base(),
      'grok-imagine-reference-to-video-private',
      'data:image/png;base64,abc',
    )
    expect(req.reference_image_urls).toEqual(['data:image/png;base64,abc'])
    expect(req.image_url).toBeUndefined()
  })

  it('sets image_url for classical i2v models', () => {
    const req = attachVideoReferenceImage(
      base(),
      'grok-imagine-image-to-video-private',
      'data:image/png;base64,abc',
    )
    expect(req.image_url).toBe('data:image/png;base64,abc')
    expect(req.reference_image_urls).toBeUndefined()
  })
})

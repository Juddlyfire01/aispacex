import { describe, it, expect, vi, afterEach } from 'vitest'
import { draftToPostBody } from './x-post-client'
import { emptyDraft, emptySegment } from './types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('draftToPostBody', () => {
  it('passes through existing mediaIds without uploading', async () => {
    const draft = emptyDraft({ kind: 'original' })
    draft.segments = [
      {
        ...emptySegment(),
        text: 'with pic',
        media: [{ id: 'm1', kind: 'image', mediaId: 'xid-1' }],
      },
    ]

    const body = await draftToPostBody(draft)
    expect(body.segments).toEqual([{ text: 'with pic', poll: undefined, mediaIds: ['xid-1'] }])
    expect(body.target).toEqual({ kind: 'original' })
  })

  it('uploads dataUrls and attaches mediaIds', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        const url = String(_input)
        if (url.includes('/api/x/media-metadata')) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        if (url.includes('/api/x/media')) {
          return new Response(JSON.stringify({ mediaId: 'uploaded-9' }), { status: 200 })
        }
        return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const draft = emptyDraft({ kind: 'original' })
    draft.segments = [
      {
        ...emptySegment(),
        text: '',
        media: [
          {
            id: 'm1',
            kind: 'gif',
            dataUrl: 'data:image/gif;base64,xx',
            altText: 'a looping gif',
          },
        ],
      },
    ]

    const body = await draftToPostBody(draft)
    expect(body.segments[0].mediaIds).toEqual(['uploaded-9'])
    expect(fetchMock).toHaveBeenCalled()
    const mediaCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/x/media'))
    expect(mediaCall?.[1]).toBeDefined()
    expect(JSON.parse(String(mediaCall![1]!.body)).mediaCategory).toBe('tweet_gif')
    const metaCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/api/x/media-metadata'),
    )
    expect(metaCall).toBeTruthy()
  })
})

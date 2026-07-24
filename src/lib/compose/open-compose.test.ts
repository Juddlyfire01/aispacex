import { beforeEach, describe, expect, it } from 'vitest'
import {
  completeDraftTarget,
  inferDraftTargetFromText,
  resolvePostAuthor,
} from './open-compose'
import { useXIntelStore } from '../../stores/x-intel-store'

describe('inferDraftTargetFromText', () => {
  beforeEach(() => {
    useXIntelStore.setState({
      targets: ['ErikVoorhees'],
      activeTarget: 'ErikVoorhees',
      reports: {},
    })
  })

  it('infers quote from "draft a quote" + post id', () => {
    expect(
      inferDraftTargetFromText(
        'draft a quote\nAustin fair-value note post:2080451660992630981',
      ),
    ).toEqual({
      kind: 'quote',
      postId: '2080451660992630981',
      username: 'ErikVoorhees',
    })
  })

  it('infers reply from reply + post id', () => {
    expect(inferDraftTargetFromText('reply to 2080451660992630981')).toEqual({
      kind: 'reply',
      toPostId: '2080451660992630981',
      toUsername: 'ErikVoorhees',
    })
  })

  it('returns undefined without a post id', () => {
    expect(inferDraftTargetFromText('draft a quote')).toBeUndefined()
  })
})

describe('completeDraftTarget', () => {
  beforeEach(() => {
    useXIntelStore.setState({
      targets: ['Austin'],
      activeTarget: 'Austin',
      reports: {},
    })
  })

  it('backfills missing quote username from active target', () => {
    expect(
      completeDraftTarget({ kind: 'quote', postId: '2080451660992630981', username: '' }),
    ).toEqual({
      kind: 'quote',
      postId: '2080451660992630981',
      username: 'Austin',
    })
    expect(resolvePostAuthor('2080451660992630981')).toBe('Austin')
  })
})

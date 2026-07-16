import { beforeEach, describe, expect, it } from 'vitest'
import { useAlphaStore } from '../../stores/alpha-store'
import { COMPOSE_ALPHA_TOOLS, executeAlphaTool } from './alpha-tools'

beforeEach(() => {
  useAlphaStore.setState({
    briefs: {
      b1: {
        id: 'b1',
        kind: 'global',
        markdown: 'Sphere accelerating on X',
        model: 'grok',
        fetchedAt: Date.now(),
        pinned: false,
      },
    },
    stories: {
      s1: {
        id: 's1',
        name: 'Sphere momentum',
        hook: 'accelerating chatter',
        clusterPostIds: ['p1'],
        fetchedAt: Date.now(),
        pinned: false,
      },
    },
    posts: {
      p1: {
        id: 'p1',
        text: 'Sphere is accelerating tonight',
        url: 'https://x.com/i/status/p1',
        fetchedAt: Date.now(),
        pinned: false,
        storyId: 's1',
      },
    },
  })
  useAlphaStore.getState().pruneCold()
})

describe('COMPOSE_ALPHA_TOOLS', () => {
  it('defines list/grep/get', () => {
    expect(COMPOSE_ALPHA_TOOLS.map((t) => t.function.name).sort()).toEqual([
      'alpha_get',
      'alpha_grep',
      'alpha_list',
    ])
    for (const t of COMPOSE_ALPHA_TOOLS) {
      expect(t.type).toBe('function')
      expect(t.function.description).toBeTruthy()
      expect(t.function.parameters).toBeTruthy()
    }
  })
})

describe('executeAlphaTool', () => {
  it('alpha_list returns archive hits', () => {
    const result = executeAlphaTool('alpha_list', {}) as {
      items: Array<{ kind: string; id: string }>
    }
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.some((h) => h.id === 'b1')).toBe(true)
  })

  it('alpha_grep finds brief', () => {
    const result = executeAlphaTool('alpha_grep', { query: 'accelerating' }) as {
      hits: Array<{ kind: string; id: string }>
    }
    expect(result.hits?.length).toBeGreaterThan(0)
    expect(result.hits.some((h) => h.kind === 'brief' && h.id === 'b1')).toBe(true)
  })

  it('alpha_get returns brief markdown', () => {
    const result = executeAlphaTool('alpha_get', { kind: 'brief', id: 'b1' }) as {
      markdown: string
    }
    expect(result.markdown).toContain('Sphere')
  })

  it('alpha_get returns story with posts', () => {
    const result = executeAlphaTool('alpha_get', { kind: 'story', id: 's1' }) as {
      story: { id: string; name: string }
      posts: Array<{ id: string }>
    }
    expect(result.story.id).toBe('s1')
    expect(result.posts.some((p) => p.id === 'p1')).toBe(true)
  })

  it('alpha_get returns post by id', () => {
    const result = executeAlphaTool('alpha_get', { kind: 'post', id: 'p1' }) as {
      id: string
      text: string
    }
    expect(result.id).toBe('p1')
    expect(result.text).toContain('accelerating')
  })

  it('unknown tool returns error', () => {
    const result = executeAlphaTool('alpha_nope', {}) as { error: string }
    expect(result).toEqual({ error: expect.any(String) })
    expect(result.error).toMatch(/unknown/i)
  })
})

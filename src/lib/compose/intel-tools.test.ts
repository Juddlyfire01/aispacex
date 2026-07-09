import { describe, it, expect } from 'vitest'
import { COMPOSE_INTEL_TOOLS, executeIntelTool } from './intel-tools'
import { sampleSnapshot } from '../intel-library/test-fixtures'
import type { ComposeScope } from '../intel-library/types'

const snap = sampleSnapshot()
const scopeAll: ComposeScope = { type: 'all' }
const ctx = { snapshot: snap, scope: scopeAll }

describe('COMPOSE_INTEL_TOOLS', () => {
  it('defines the seven intel tools', () => {
    const names = COMPOSE_INTEL_TOOLS.map((t) => t.function.name)
    expect(names).toEqual([
      'intel_list_subjects',
      'intel_glob',
      'intel_grep',
      'intel_get_profile',
      'intel_get_posts',
      'intel_get_report',
      'intel_get_edges',
    ])
    for (const t of COMPOSE_INTEL_TOOLS) {
      expect(t.type).toBe('function')
      expect(t.function.description).toBeTruthy()
      expect(t.function.parameters).toBeTruthy()
    }
  })
})

describe('executeIntelTool', () => {
  it('list subjects returns summaries', () => {
    const result = executeIntelTool('intel_list_subjects', {}, ctx)
    expect(Array.isArray(result)).toBe(true)
    const list = result as Array<Record<string, unknown>>
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      username: expect.any(String),
      postCount: expect.any(Number),
      reportCount: expect.any(Number),
      hasProfile: expect.any(Boolean),
    })
    expect(list[0]).not.toHaveProperty('posts')
  })

  it('grep staking finds p1', () => {
    const result = executeIntelTool('intel_grep', { query: 'staking' }, ctx)
    expect(Array.isArray(result)).toBe(true)
    const hits = result as Array<{ id: string }>
    expect(hits.some((h) => h.id === 'p1')).toBe(true)
  })

  it('get_posts AskVenice since works', () => {
    const result = executeIntelTool(
      'intel_get_posts',
      { handle: 'AskVenice', since: '2026-07-05' },
      ctx,
    )
    expect(Array.isArray(result)).toBe(true)
    const posts = result as Array<{ id: string }>
    expect(posts.some((p) => p.id === 't1')).toBe(true)
    expect(posts.every((p) => p.id !== 't2')).toBe(true)
  })

  it('unknown tool returns error', () => {
    const result = executeIntelTool('intel_nope', {}, ctx)
    expect(result).toEqual({ error: expect.any(String) })
    expect((result as { error: string }).error).toMatch(/unknown/i)
  })
})

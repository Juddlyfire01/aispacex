import { describe, expect, it } from 'vitest'
import type { AlphaColdBrief, AlphaColdStory, AlphaRail } from '../alpha/types'
import {
  buildBriefHandoffMessages,
  buildRailHandoffMessages,
  buildStoryHandoffMessages,
} from './open-alpha-compose'

describe('buildBriefHandoffMessages', () => {
  it('includes brief markdown in prompt and short display label', () => {
    const brief: AlphaColdBrief = {
      id: 'b1',
      kind: 'global',
      markdown: '## Accelerating narratives\n\n- $VVV heat rising',
      model: 'grok-imagine',
      fetchedAt: Date.now(),
      pinned: false,
    }
    const { displayContent, promptContent } = buildBriefHandoffMessages(brief)
    expect(displayContent).toMatch(/Alpha brief/i)
    expect(displayContent).toMatch(/Radar/i)
    expect(promptContent).toContain('## Accelerating narratives')
    expect(promptContent).toContain('$VVV heat rising')
    expect(promptContent).toMatch(/Draft only if I ask/i)
  })

  it('labels rail briefs with rail metadata', () => {
    const brief: AlphaColdBrief = {
      id: 'b2',
      kind: 'rail',
      railId: 'venice',
      railLabel: 'Venice',
      query: '($VVV OR VeniceAI)',
      markdown: 'Rail-specific heat.',
      model: 'grok-imagine',
      fetchedAt: Date.now(),
      pinned: false,
    }
    const { displayContent, promptContent } = buildBriefHandoffMessages(brief)
    expect(displayContent).toContain('Venice')
    expect(promptContent).toContain('($VVV OR VeniceAI)')
    expect(promptContent).toContain('Rail-specific heat.')
  })
})

describe('buildStoryHandoffMessages', () => {
  it('includes story name and cluster links in prompt', () => {
    const story: AlphaColdStory = {
      id: 's1',
      name: 'DIEM mint cliff chatter',
      hook: 'Capacity talk heating up',
      url: 'https://x.com/i/news/s1',
      clusterPostIds: ['111', '222'],
      fetchedAt: Date.now(),
      pinned: false,
    }
    const { displayContent, promptContent } = buildStoryHandoffMessages(story)
    expect(displayContent).toMatch(/DIEM mint cliff chatter/)
    expect(promptContent).toContain('DIEM mint cliff chatter')
    expect(promptContent).toContain('Capacity talk heating up')
    expect(promptContent).toContain('https://x.com/i/news/s1')
    expect(promptContent).toContain('https://x.com/i/status/111')
    expect(promptContent).toContain('https://x.com/i/status/222')
  })
})

describe('buildRailHandoffMessages', () => {
  it('includes rail query and optional velocity line', () => {
    const rail: AlphaRail = {
      id: 'r1',
      label: 'Privacy',
      query: 'privacy OR open-weight',
      source: 'system',
      enabled: true,
    }
    const { displayContent, promptContent } = buildRailHandoffMessages(
      rail,
      '+42% 1h · +12% 24h',
    )
    expect(displayContent).toContain('Privacy')
    expect(promptContent).toContain('Privacy')
    expect(promptContent).toContain('privacy OR open-weight')
    expect(promptContent).toContain('+42% 1h · +12% 24h')
  })
})

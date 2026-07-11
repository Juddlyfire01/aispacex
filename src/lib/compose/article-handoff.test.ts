import { describe, it, expect } from 'vitest'
import { looksLikeDraftIntent } from './article-handoff'

describe('looksLikeDraftIntent', () => {
  it('detects draft / article requests', () => {
    expect(looksLikeDraftIntent('draft an article about VVV')).toBe(true)
    expect(looksLikeDraftIntent('use the draft tool')).toBe(true)
    expect(looksLikeDraftIntent('what is staking APR?')).toBe(false)
  })

  it('does not treat research / reply-scouting as draft intent', () => {
    expect(
      looksLikeDraftIntent(
        'find a post from @jonshapeshift that i can reply to and link the article',
      ),
    ).toBe(false)
  })
})

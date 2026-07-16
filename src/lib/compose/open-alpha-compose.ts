import { useComposeStore } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import type { AlphaColdBrief, AlphaColdStory, AlphaRail } from '../alpha/types'

export function buildBriefHandoffMessages(brief: AlphaColdBrief): {
  displayContent: string
  promptContent: string
} {
  const label =
    brief.kind === 'rail'
      ? `Alpha brief · ${brief.railLabel ?? brief.railId ?? 'rail'}`
      : 'Alpha brief · watchlist'
  return {
    displayContent: `${label} (handed off from Radar)`,
    promptContent: [
      `ALPHA HANDOFF (${label})`,
      brief.query ? `Query: ${brief.query}` : null,
      `Model: ${brief.model}`,
      '',
      brief.markdown,
      '',
      'Use this as research context. Draft only if I ask.',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

export function buildStoryHandoffMessages(story: AlphaColdStory): {
  displayContent: string
  promptContent: string
} {
  const clusterLinks = story.clusterPostIds
    .slice(0, 25)
    .map((id) => `- https://x.com/i/status/${id}`)
  return {
    displayContent: `Alpha story · ${story.name} (handed off from Radar)`,
    promptContent: [
      `ALPHA HANDOFF (news story)`,
      `Name: ${story.name}`,
      story.hook ? `Hook: ${story.hook}` : null,
      story.summary ? `Summary: ${story.summary}` : null,
      story.category ? `Category: ${story.category}` : null,
      story.url ? `URL: ${story.url}` : null,
      clusterLinks.length > 0 ? '' : null,
      clusterLinks.length > 0 ? 'Cluster posts:' : null,
      ...clusterLinks,
      '',
      'Use this as research context. Draft only if I ask.',
    ]
      .filter((line) => line != null)
      .join('\n'),
  }
}

export function buildRailHandoffMessages(
  rail: AlphaRail,
  velocityLine?: string,
): {
  displayContent: string
  promptContent: string
} {
  return {
    displayContent: `Alpha rail · ${rail.label} (handed off from Radar)`,
    promptContent: [
      `ALPHA HANDOFF (rail)`,
      `Label: ${rail.label}`,
      `Query: ${rail.query}`,
      velocityLine ? `Velocity: ${velocityLine}` : null,
      '',
      'Use this as research context. Draft only if I ask.',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

/** Seed a new Compose thread from Alpha Radar without auto-drafting. */
export function openComposeWithAlphaSeed(opts: {
  displayContent: string
  promptContent: string
}) {
  const store = useComposeStore.getState()
  const id = store.createThread(store.newThreadContext)
  store.selectThread(id)
  store.addMessage(id, {
    role: 'user',
    content: opts.promptContent,
    displayContent: opts.displayContent,
  })
  store.setActivePostSubTab('composer')
  useXIntelStore.getState().setActiveTopTab('post')
  store.setDraftDrawerOpen(true)
}

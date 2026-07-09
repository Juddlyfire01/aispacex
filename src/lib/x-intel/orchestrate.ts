import { gatherProfile, gatherPosts, gatherMentions } from './gather'
import { resolveGatherAuth } from './gather-auth'
import { deriveEdges } from './normalize'
import { computeAnalytics, computeDelta, postDateRange } from './analytics'
import { partitionPosts } from './activity'
import { synthesizeReport } from './synthesize'
import { mergePosts, useXIntelStore, newReportId, findReportKey, type RefreshedAt, type IntelReport } from '../../stores/x-intel-store'
import type { IntelReportSnapshot, Post } from './types'

function requireReport(username: string): { key: string; report: IntelReport } {
  const reports = useXIntelStore.getState().reports
  const key = findReportKey(reports, username)
  if (!key) throw new Error(`No report for ${username}`)
  return { key, report: reports[key] }
}

/**
 * Build the next refreshedAt map for a report, stamping the given section(s) with
 * the current time. Called only after a gather resolves successfully — so a
 * "nothing new" (HTTP 200, zero posts) refresh still records that we checked,
 * while a thrown fetch never reaches here and leaves the old timestamp intact.
 */
function markRefreshed(key: string, ...sections: (keyof RefreshedAt)[]): RefreshedAt {
  const prev = useXIntelStore.getState().reports[key]?.refreshedAt ?? {}
  const now = new Date().toISOString()
  const next: RefreshedAt = { ...prev }
  for (const s of sections) next[s] = now
  return next
}

/**
 * The "everything" pull for a target: profile → outbound posts (incremental if
 * we have a mostRecentPostId) + inbound mentions → local edge derivation.
 * Updates the store and cost meter. Backs the Profile tab's Refresh button and
 * the initial gather when a target is added. A mentions hiccup is non-fatal —
 * posts still land — so the core timeline is never lost to an inbound failure.
 */
export async function runGather(username: string, opts: { backfill?: number } = {}): Promise<void> {
  const { updateReport, addCost } = useXIntelStore.getState()
  const { key, report } = requireReport(username)
  const apiUsername = report.profile?.username ?? report.username
  const auth = resolveGatherAuth(apiUsername)

  // 1. Profile — always refresh (cheap, metrics change)
  const profileResult = await gatherProfile(apiUsername, auth)
  addCost(key, profileResult.cost)
  const profile = profileResult.data
  updateReport(key, { profile })

  // 2. Posts (outbound, incremental via since_id) + mentions (inbound), in parallel
  // Re-read the current state to avoid a stale snapshot
  const currentReport = useXIntelStore.getState().reports[key]
  const sinceId = currentReport && currentReport.posts.length > 0
    ? currentReport.profile?.mostRecentPostId ?? undefined
    : undefined
  const [postsResult, mentionsResult] = await Promise.all([
    gatherPosts(profile.id, auth, { sinceId, maxResults: opts.backfill ?? 50 }),
    gatherMentions(profile.id, auth).catch(() => ({ data: [] as Post[], cost: 0 })),
  ])
  addCost(key, postsResult.cost)
  addCost(key, mentionsResult.cost)

  // Re-read posts right before merging to avoid stale snapshot from concurrent gathers
  const existingPosts = useXIntelStore.getState().reports[key]?.posts ?? []
  const merged = mergePosts(mergePosts(existingPosts, postsResult.data), mentionsResult.data)

  // 3. Edges — recomputed locally from the full merged post set (outbound + inbound), free
  const edges = deriveEdges(profile.id, merged)

  updateReport(key, { posts: merged, edges, refreshedAt: markRefreshed(key, 'profile', 'feed', 'network') })
}

/**
 * Refresh only the target's profile (metrics, bio, avatar). Cheapest single
 * refresh — one user lookup — used by the Profile section's Refresh action.
 */
export async function refreshProfile(username: string): Promise<void> {
  const { updateReport, addCost } = useXIntelStore.getState()
  const { key, report } = requireReport(username)
  const apiUsername = report.profile?.username ?? report.username
  const auth = resolveGatherAuth(apiUsername)

  const result = await gatherProfile(apiUsername, auth)
  addCost(key, result.cost)
  updateReport(key, { profile: result.data, refreshedAt: markRefreshed(key, 'profile') })
}

/**
 * Refresh the target's posts (incremental when we already hold posts), then
 * re-derive network edges from the merged set. Backs both the Feed section
 * and the Network section's base refresh.
 */
export async function refreshPosts(username: string): Promise<void> {
  const { updateReport, addCost } = useXIntelStore.getState()
  const { key, report } = requireReport(username)
  const apiUsername = report.profile?.username ?? report.username
  const auth = resolveGatherAuth(apiUsername)

  // Need a profile id to query posts; fetch it first if we don't have one yet.
  let profileId = report.profile?.id
  if (!profileId) {
    const profileResult = await gatherProfile(apiUsername, auth)
    addCost(key, profileResult.cost)
    updateReport(key, { profile: profileResult.data, refreshedAt: markRefreshed(key, 'profile') })
    profileId = profileResult.data.id
  }

  const sinceId = report.posts.length > 0 ? report.profile?.mostRecentPostId ?? undefined : undefined
  const postsResult = await gatherPosts(profileId, auth, { sinceId })
  addCost(key, postsResult.cost)

  const existingPosts = useXIntelStore.getState().reports[key]?.posts ?? []
  const merged = mergePosts(existingPosts, postsResult.data)
  const edges = deriveEdges(profileId, merged)
  // Stamp feed + network on every success — a zero-new-posts pull still means
  // "checked just now", so the label must move even though `merged` is unchanged.
  updateReport(key, { posts: merged, edges, refreshedAt: markRefreshed(key, 'feed', 'network') })
}

/**
 * Enrich the network with inbound engagement: who is mentioning the target.
 * Uses the (previously unwired) mentions endpoint, merges the returned posts
 * into the store, and re-derives edges so the graph reflects both outbound
 * (target → others) and inbound (others → target) activity.
 */
export async function refreshNetworkWithMentions(username: string): Promise<void> {
  const { updateReport, addCost } = useXIntelStore.getState()
  const { key, report } = requireReport(username)
  const apiUsername = report.profile?.username ?? report.username
  const auth = resolveGatherAuth(apiUsername)

  let profileId = report.profile?.id
  if (!profileId) {
    const profileResult = await gatherProfile(apiUsername, auth)
    addCost(key, profileResult.cost)
    updateReport(key, { profile: profileResult.data, refreshedAt: markRefreshed(key, 'profile') })
    profileId = profileResult.data.id
  }

  const mentionsResult = await gatherMentions(profileId, auth)
  addCost(key, mentionsResult.cost)

  const existingPosts = useXIntelStore.getState().reports[key]?.posts ?? []
  const merged = mergePosts(existingPosts, mentionsResult.data)
  const edges = deriveEdges(profileId, merged)
  updateReport(key, { posts: merged, edges, refreshedAt: markRefreshed(key, 'network', 'feed') })
}

/**
 * Generate a comprehensive intelligence report over the CURRENTLY-STORED posts
 * (no gather, no X cost). Computes deterministic analytics, diffs against the
 * previous report when one exists, asks Venice to interpret both, and appends an
 * immutable snapshot to the report ledger. Returns the new snapshot.
 *
 * Analytics are frozen into the snapshot so historical reports never drift when
 * post metrics change on a later re-gather.
 */
export async function generateReport(username: string): Promise<IntelReportSnapshot> {
  const store = useXIntelStore.getState()
  const { key, report } = requireReport(username)
  if (store.generatingReports[key]) {
    throw new Error('A report is already generating for this profile')
  }
  if (!report.profile) throw new Error('Gather the profile first')
  if (report.posts.length === 0) throw new Error('Gather posts first (re-gather from the profile rail)')

  // Snapshot inputs up front so navigate-away / store churn cannot mid-flight
  // the analytics + synthesis against a different corpus.
  const profile = report.profile
  const posts = report.posts
  const edges = report.edges
  const synthesisSettings = { ...report.synthesisSettings }
  const reportHistory = report.reportHistory

  store.setReportGenerating(key, true)
  store.setReportGenerateError(key, null)

  try {
    const analytics = computeAnalytics(profile, posts, edges)
    const prevSnapshot = reportHistory[0] ?? null

    // Computed delta vs. the previous report (baseline = null)
    let computedDelta: Omit<import('./types').ChangeSummary, 'narrative'> | null = null
    if (prevSnapshot) {
      const prevIds = new Set(prevSnapshot.meta.postIdsAnalyzed)
      const newPosts = posts.filter((p) => !prevIds.has(p.id))
      const { own: newOwn, inbound: newInbound } = partitionPosts(profile, newPosts)
      computedDelta = computeDelta(prevSnapshot.analytics, analytics, newOwn, newInbound)
    }

    // Resolve the prior reports the user chose to feed in as narrative context.
    const includedIds = new Set(synthesisSettings.includedReportIds ?? [])
    const includedReports = reportHistory.filter((r) => includedIds.has(r.id))

    const { narrative, changeNarrative, tokenCost, promptTokens, completionTokens } = await synthesizeReport(
      profile,
      posts,
      analytics,
      computedDelta,
      prevSnapshot,
      synthesisSettings,
      includedReports,
    )

    const snapshot: IntelReportSnapshot = {
      id: newReportId(),
      createdAt: new Date().toISOString(),
      model: synthesisSettings.model,
      synthesisSettings: { ...synthesisSettings },
      meta: {
        postCount: posts.length,
        dateRange: postDateRange(posts),
        postIdsAnalyzed: posts.map((p) => p.id),
        tokenCost,
        promptTokens,
        completionTokens,
        includedReportIds: includedReports.map((r) => r.id),
      },
      analytics,
      narrative,
      changeSummary: computedDelta ? { ...computedDelta, narrative: changeNarrative ?? '' } : null,
      previousReportId: prevSnapshot?.id ?? null,
    }

    useXIntelStore.getState().appendReport(key, snapshot)
    return snapshot
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Report generation failed'
    useXIntelStore.getState().setReportGenerateError(key, message)
    throw e
  } finally {
    useXIntelStore.getState().setReportGenerating(key, false)
  }
}

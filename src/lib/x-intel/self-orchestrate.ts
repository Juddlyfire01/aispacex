// Orchestration for the connected user's OWN data (Profile tab). Reuses the
// exact analytics + synthesis pipeline that targets use, so the self-report is
// structurally identical to a target report (everything a target has) — plus
// bookmarks/likes context the target path can't access.
//
// Multi-account: the session probe returns the full account list; we reconcile
// the store (add new accounts, drop disconnected, set active). gatherSelf /
// generateSelfReport operate on the active account id; the server-side
// x_active_account cookie already routes /api/x/proxy calls to that account.
import { gatherSelfProfile, gatherSelfPosts, gatherSelfBookmarks, gatherSelfLikes } from './self-gather'
import { getSelfSession, selfLogout, switchActiveAccount } from './self-client'
import { deriveEdges } from './normalize'
import { computeAnalytics, computeDelta, postDateRange } from './analytics'
import { partitionPosts } from './activity'
import { synthesizeReport } from './synthesize'
import { mergePosts, newReportId, useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { useSettingsStore } from '../../stores/settings-store'
import { toast } from '../../stores/toast-store'
import { runGather } from './orchestrate'
import { DEFAULT_TARGET } from './fields'
import type { IntelReportSnapshot, ChangeSummary, Post } from './types'

let sessionRefreshPromise: Promise<boolean> | null = null
let oauthBootstrapPromise: ReturnType<typeof runOAuthBootstrap> | null = null

/**
 * Resolve once the self store's persist layer has hydrated from localStorage.
 * zustand hydrates asynchronously, so writing server truth (connected/accounts/
 * activeAccountId) before hydration finishes lets the late hydration merge
 * clobber those fields — which is what makes the just-connected account fail to
 * load and the "No account selected" state flash mid-connect. Gate reconcile on
 * this so we always write on top of the hydrated baseline.
 */
function awaitSelfHydration(): Promise<void> {
  if (useXSelfStore.persist.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsub = useXSelfStore.persist.onFinishHydration(() => {
      unsub?.()
      resolve()
    })
    // Guard against a hydration that finished between the check and subscribe.
    if (useXSelfStore.persist.hasHydrated()) resolve()
  })
}

/** Reconcile the store with the server-side account list + active account. */
function reconcileAccounts(session: { connected: boolean; accountId?: string; username?: string; accounts: { id: string; username: string }[] }): void {
  const store = useXSelfStore.getState()
  store.setConnected(session.connected)
  for (const a of session.accounts) store.upsertAccount(a)
  // Drop accounts the server no longer knows about FROM THE RAIL — but keep
  // their encrypted cache so reconnecting the same X id revives the data.
  const serverIds = new Set(session.accounts.map((a) => a.id))
  for (const id of store.accountOrder) {
    if (!serverIds.has(id)) store.disconnectAccount(id)
  }
  if (session.connected && session.accountId) {
    store.setActiveAccount(session.accountId)
  } else {
    store.setActiveAccount(null)
  }
}

async function probeSelfSession(): Promise<boolean> {
  // Fetch the session and wait for persist hydration in parallel, then reconcile
  // on top of the hydrated baseline so a late hydration can't overwrite the
  // server-truth account list / active account we're about to set.
  const [session] = await Promise.all([getSelfSession(), awaitSelfHydration()])
  reconcileAccounts(session)
  if (session.connected) seedDefaultTarget()
  return session.connected
}

/**
 * Probe the server session and reflect it into the store. Concurrent callers
 * share one in-flight request so IntelView + SelfProfileView cannot race and
 * overwrite each other with stale disconnected results.
 */
export function refreshSelfSession(): Promise<boolean> {
  sessionRefreshPromise ??= probeSelfSession().finally(() => {
    sessionRefreshPromise = null
  })
  return sessionRefreshPromise
}

/** Disconnect the active OAuth account — shared by self Profile and Others
 *  profile cards so both surfaces always log out the same server-side session. */
export async function disconnectActiveAccount(): Promise<void> {
  const store = useXSelfStore.getState()
  const activeAccountId = store.activeAccountId
  if (!activeAccountId) return
  const username = store.accounts[activeAccountId]?.username ?? 'account'
  if (!confirm(`Disconnect @${username}? Your gathered data stays encrypted on this device and is revived if you reconnect. Clear it anytime from Settings → Data & privacy.`)) return
  await selfLogout(activeAccountId)
  store.disconnectAccount(activeAccountId)
  await refreshSelfSession()
}

export interface OAuthBootstrapResult {
  connected: boolean
  oauthReturn: boolean
  oauthError: string | null
}

/**
 * Run once on app load: reconcile the OAuth session, surface callback errors,
 * switch to Intel after a successful connect, and strip ?x_connected / ?x_error
 * from the URL regardless of which tab is active.
 */
export function bootstrapXOAuthReturn(): Promise<OAuthBootstrapResult> {
  oauthBootstrapPromise ??= runOAuthBootstrap()
  return oauthBootstrapPromise
}

async function runOAuthBootstrap(): Promise<OAuthBootstrapResult> {
  const params = new URLSearchParams(window.location.search)
  const oauthError = params.get('x_error')
  const oauthReturn = params.get('x_connected') !== null || !!oauthError

  // An OAuth round-trip is "in progress" when we land here straight from the
  // callback (?x_connected / ?x_error) OR when a click flagged the sessionStorage
  // bridge and we're still on the same tab. Either way, show the connecting UI
  // until the session probe resolves.
  const inProgress = oauthReturn || sessionStorage.getItem('x_oauth_in_progress') === '1'
  if (inProgress) useXSelfStore.getState().setConnecting(true)

  let connected = false
  try {
    connected = await refreshSelfSession()
    // Auth cookies are set on the callback 302; retry once if the probe races the redirect.
    if (oauthReturn && !oauthError && !connected) {
      await new Promise((r) => setTimeout(r, 150))
      connected = await refreshSelfSession()
    }
  } catch {
    connected = false
  }

  // The round-trip is over — clear the bridge and drop the connecting flag so the
  // real connected/disconnected state can render. Only clear `connecting` if THIS
  // bootstrap owned it (inProgress): otherwise a probe that resolves during the
  // pre-redirect frames of a fresh Connect click would stomp the spinner the
  // click just turned on, flashing back to the Connect button before redirect.
  try { sessionStorage.removeItem('x_oauth_in_progress') } catch { /* private mode */ }
  if (inProgress) useXSelfStore.getState().setConnecting(false)

  if (oauthReturn) {
    window.history.replaceState({}, '', window.location.pathname)
  }

  if (oauthError) {
    toast.error('X connect failed', oauthError)
  } else if (oauthReturn && connected) {
    useSettingsStore.getState().setActiveTab('intel')
    toast.success('Connected to X')
  } else if (oauthReturn && !connected) {
    toast.error('X connect failed', 'Session could not be established after redirect.')
  }

  return { connected, oauthReturn, oauthError }
}

/** Add @AskVenice as the first target (and gather it) when none exist yet. */
function seedDefaultTarget(): void {
  const trySeed = () => {
    const intel = useXIntelStore.getState()
    if (intel.targets.length > 0) return
    intel.addTarget(DEFAULT_TARGET)
    runGather(DEFAULT_TARGET).catch(() => { /* surfaced in the target rail */ })
  }

  if (useXIntelStore.persist.hasHydrated()) {
    trySeed()
  } else {
    useXIntelStore.persist.onFinishHydration(trySeed)
  }
}

/** Switch the active account server-side and reflect it in the store. */
export async function selectSelfAccount(accountId: string): Promise<boolean> {
  const result = await switchActiveAccount(accountId)
  if (!result.ok) return false
  useXSelfStore.getState().setActiveAccount(accountId)
  return true
}

/** Refresh only the active account's posts (lighter than a full gatherSelf).
 *  Mirrors refreshPosts() on the target side. */
export async function refreshSelfPosts(opts: { maxResults?: number } = {}): Promise<void> {
  const store = useXSelfStore.getState()
  const accountId = store.activeAccountId
  if (!accountId) throw new Error('No active account')
  const account = store.accounts[accountId]
  if (!account?.profile) throw new Error('Load your profile first')

  const posts = await gatherSelfPosts(account.profile.id, opts).catch(() => [] as Post[])
  const merged = mergePosts(account.posts, posts)
  useXSelfStore.getState().setPosts(accountId, merged)
  useXSelfStore.getState().markRefreshed(accountId, 'posts')
  useXSelfStore.getState().setEdges(accountId, deriveEdges(account.profile.id, merged))
}

/** Refresh the active account's network by pulling mentions (who's mentioning
 *  them). Mirrors refreshNetworkWithMentions() on the target side. The edges
 *  from posts are already derived in gatherSelf/refreshSelfPosts; this is a
 *  placeholder for the self-side mentions pull (deferred until the self-side
 *  mentions endpoint is wired). For now it just re-pulls posts. */
export async function refreshSelfNetwork(): Promise<void> {
  await refreshSelfPosts()
}

/** Full gather of the connected (active) user: profile → posts → bookmarks → likes → edges. */
export async function gatherSelf(opts: { maxResults?: number } = {}): Promise<void> {
  const store = useXSelfStore.getState()
  const accountId = store.activeAccountId
  if (!accountId) throw new Error('No active account')

  const profile = await gatherSelfProfile()
  store.upsertAccount({ id: accountId, username: profile.username })
  store.setProfile(accountId, profile)
  store.markRefreshed(accountId, 'profile')

  const [posts, bookmarks, likes] = await Promise.all([
    gatherSelfPosts(profile.id, opts).catch(() => [] as never[]),
    gatherSelfBookmarks(profile.id, opts).catch(() => [] as never[]),
    gatherSelfLikes(profile.id, opts).catch(() => [] as never[]),
  ])

  const account = useXSelfStore.getState().accounts[accountId]
  const mergedPosts = mergePosts(account?.posts ?? [], posts)
  store.setPosts(accountId, mergedPosts)
  store.markRefreshed(accountId, 'posts')

  store.setBookmarks(accountId, mergePosts(account?.bookmarks ?? [], bookmarks))
  store.markRefreshed(accountId, 'bookmarks')

  store.setLikes(accountId, mergePosts(account?.likes ?? [], likes))
  store.markRefreshed(accountId, 'likes')

  store.setEdges(accountId, deriveEdges(profile.id, mergedPosts))
}

/** Generate a full intelligence report over the connected user's own posts. */
export async function generateSelfReport(): Promise<IntelReportSnapshot> {
  const state = useXSelfStore.getState()
  const accountId = state.activeAccountId
  if (!accountId) throw new Error('No active account')
  const account = state.accounts[accountId]
  if (!account || !account.profile) throw new Error('Load your profile first')
  if (account.posts.length === 0) throw new Error('Gather your posts first')

  const settings = account.synthesisSettings
  const analytics = computeAnalytics(account.profile, account.posts, account.edges)
  const prevSnapshot = account.reportHistory[0] ?? null

  let computedDelta: Omit<ChangeSummary, 'narrative'> | null = null
  if (prevSnapshot) {
    const prevIds = new Set(prevSnapshot.meta.postIdsAnalyzed)
    const newPosts = account.posts.filter((p) => !prevIds.has(p.id))
    const { own: newOwn, inbound: newInbound } = partitionPosts(account.profile, newPosts)
    computedDelta = computeDelta(prevSnapshot.analytics, analytics, newOwn, newInbound)
  }

  const { narrative, changeNarrative, tokenCost } = await synthesizeReport(
    account.profile, account.posts, analytics, computedDelta, prevSnapshot, settings,
  )

  const snapshot: IntelReportSnapshot = {
    id: newReportId(),
    createdAt: new Date().toISOString(),
    model: settings.model,
    synthesisSettings: { ...settings },
    meta: {
      postCount: account.posts.length,
      dateRange: postDateRange(account.posts),
      postIdsAnalyzed: account.posts.map((p) => p.id),
      tokenCost,
    },
    analytics,
    narrative,
    changeSummary: computedDelta ? { ...computedDelta, narrative: changeNarrative ?? '' } : null,
    previousReportId: prevSnapshot?.id ?? null,
  }

  useXSelfStore.getState().appendReport(accountId, snapshot)
  return snapshot
}

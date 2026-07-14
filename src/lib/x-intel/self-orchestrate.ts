// Orchestration for the connected user's OWN data (Profile tab). Reuses the
// exact analytics + synthesis pipeline that targets use, so the self-report is
// structurally identical to a target report (everything a target has) — plus
// bookmarks/likes context the target path can't access.
//
// Multi-account: the session probe returns the full account list; we reconcile
// the store (add new accounts, drop disconnected, set active). gatherSelf /
// generateSelfReport operate on the active account id; the server-side
// x_active_account cookie already routes /api/x/proxy calls to that account.
import {
  gatherSelfProfile,
  gatherSelfPosts,
  gatherSelfMentions,
  gatherSelfBookmarks,
  gatherSelfLikes,
} from './self-gather'
import {
  getSelfSession,
  isXOAuthCallbackUrl,
  isXOAuthReturnPending,
  prefetchIntelView,
  selfLogout,
  switchActiveAccount,
  X_OAUTH_IN_PROGRESS_KEY,
  X_OAUTH_INTEL_TAB_KEY,
} from './self-client'
import { deriveEdges } from './normalize'
import { computeAnalytics, computeDelta, postDateRange } from './analytics'
import { partitionPosts } from './activity'
import { synthesizeReport } from './synthesize'
import { beginReportProgress } from './report-progress'
import { canGenerateAfterRefresh, GENERATE_NEEDS_REFRESH_HINT } from './report-gate'
import { flushEncryptedStorage } from '../encrypted-storage'
import type { IntelTopTab } from '../../stores/x-intel-store'
import { findReportKey, mergePosts, newReportId, useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { useSettingsStore } from '../../stores/settings-store'
import { toast } from '../../stores/toast-store'
import { confirmDialog } from '../../stores/confirm-store'
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
  seedDefaultTarget()
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
  const ok = await confirmDialog({
    title: 'Disconnect account',
    description: `@${username} · Gathered data stays encrypted on this device and is revived if you reconnect.`,
    confirmLabel: 'Disconnect',
    danger: true,
  })
  if (!ok) return
  await selfLogout(activeAccountId)
  store.disconnectAccount(activeAccountId)
  await refreshSelfSession()
}

export interface OAuthBootstrapResult {
  connected: boolean
  oauthReturn: boolean
  oauthError: string | null
}

/** Force Intel tab even if async settings hydration reloads a prior tab. */
function pinIntelTab(): void {
  useSettingsStore.getState().setActiveTab('intel')
  if (!useSettingsStore.persist.hasHydrated()) {
    const unsub = useSettingsStore.persist.onFinishHydration(() => {
      unsub?.()
      // Only re-pin while the OAuth handoff is still live.
      if (useXSelfStore.getState().connecting || isXOAuthReturnPending()) {
        useSettingsStore.getState().setActiveTab('intel')
      }
    })
  }
}

/**
 * Synchronous first-paint shell for OAuth return.
 * Call from module scope / before React mounts so the user lands on Intel with
 * `connecting` already true — avoiding a flash of the prior tab, Connect CTA,
 * or the generic "Loading intel…" Suspense spinner.
 */
export function primeXOAuthReturnShell(): boolean {
  if (typeof window === 'undefined') return false
  const pending = isXOAuthReturnPending()
  if (!pending) return false

  useXSelfStore.getState().setConnecting(true)
  pinIntelTab()

  const saved = readOAuthIntelTopTab()
  // Successful callback should open You; errors / in-progress keep the pre-click tab if known.
  const oauthError = new URLSearchParams(window.location.search).get('x_error')
  if (isXOAuthCallbackUrl() && !oauthError) {
    useXIntelStore.getState().setActiveTopTab(saved ?? 'me')
  } else if (saved) {
    useXIntelStore.getState().setActiveTopTab(saved)
  }

  prefetchIntelView()
  return true
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

function readOAuthIntelTopTab(): IntelTopTab | null {
  try {
    const saved = sessionStorage.getItem(X_OAUTH_INTEL_TAB_KEY)
    if (saved === 'me' || saved === 'targets' || saved === 'post') return saved
  } catch { /* private mode */ }
  return null
}

async function runOAuthBootstrap(): Promise<OAuthBootstrapResult> {
  const params = new URLSearchParams(window.location.search)
  const oauthError = params.get('x_error')
  const oauthReturn = isXOAuthCallbackUrl()

  // An OAuth round-trip is "in progress" when we land here straight from the
  // callback (?x_connected / ?x_error) OR when a click flagged the sessionStorage
  // bridge. primeXOAuthReturnShell usually already set connecting + intel tab;
  // re-apply so late callers still get a coherent shell.
  const inProgress = oauthReturn || isXOAuthReturnPending()
  if (inProgress) {
    useXSelfStore.getState().setConnecting(true)
    pinIntelTab()
    prefetchIntelView()
  }

  const savedIntelTab = inProgress ? readOAuthIntelTopTab() : null

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

  // Route to the right Intel sub-tab BEFORE clearing connecting, so SelfProfileView
  // never paints Connect CTA / wrong top-tab between probe settle and tab switch.
  if (oauthError) {
    // leave top tab as primed
  } else if (oauthReturn && connected) {
    pinIntelTab()
    useXIntelStore.getState().setActiveTopTab(savedIntelTab ?? 'me')
  } else if (inProgress && !oauthReturn && savedIntelTab) {
    useXIntelStore.getState().setActiveTopTab(savedIntelTab)
  }

  // The round-trip is over — clear the bridge and drop the connecting flag so the
  // real connected/disconnected state can render. Only clear `connecting` if THIS
  // bootstrap owned it (inProgress): otherwise a probe that resolves during the
  // pre-redirect frames of a fresh Connect click would stomp the spinner the
  // click just turned on, flashing back to the Connect button before redirect.
  try { sessionStorage.removeItem(X_OAUTH_IN_PROGRESS_KEY) } catch { /* private mode */ }
  try { sessionStorage.removeItem(X_OAUTH_INTEL_TAB_KEY) } catch { /* private mode */ }
  if (inProgress) useXSelfStore.getState().setConnecting(false)

  if (oauthReturn) {
    window.history.replaceState({}, '', window.location.pathname)
  }

  if (oauthError) {
    toast.error('X connect failed', oauthError)
  } else if (oauthReturn && connected) {
    toast.success('Connected to X')
    refreshDefaultTarget()
  } else if (oauthReturn && !connected) {
    toast.error('X connect failed', 'Session could not be established after redirect.')
  }

  return { connected, oauthReturn, oauthError }
}

/** Ensure @AskVenice is in the Others rail (when empty) and set to auto-refresh when connected. */
function ensureDefaultTarget(): string | null {
  const intel = useXIntelStore.getState()
  const onRail = intel.targets.some((t) => t.toLowerCase() === DEFAULT_TARGET.toLowerCase())
  if (!onRail) {
    if (intel.targets.length > 0) return null
    intel.addTarget(DEFAULT_TARGET)
  }
  const key =
    findReportKey(useXIntelStore.getState().reports, DEFAULT_TARGET)
    ?? useXIntelStore.getState().targets.find((t) => t.toLowerCase() === DEFAULT_TARGET.toLowerCase())
    ?? DEFAULT_TARGET
  const report = useXIntelStore.getState().reports[key]
  const connected = useXSelfStore.getState().connected
  if (report && connected && !report.watch) {
    useXIntelStore.getState().updateReport(key, { watch: true })
  }
  return key
}

/** Pull a fresh profile/posts/network for the default target (demo path when disconnected). */
export function refreshDefaultTarget(): void {
  const key = ensureDefaultTarget()
  if (!key) return
  runGather(key).catch(() => { /* surfaced in the target rail */ })
}

/** Add @AskVenice as the first target in the Others rail (and gather when X is connected). */
function seedDefaultTarget(): void {
  const trySeed = () => {
    ensureDefaultTarget()
    refreshDefaultTarget()
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
 *  Mirrors refreshPosts() on the target side. Timeline + inbound mentions so
 *  Feed "Replies" / "Mentions in" stay populated. */
export async function refreshSelfPosts(opts: { maxResults?: number } = {}): Promise<void> {
  const store = useXSelfStore.getState()
  const accountId = store.activeAccountId
  if (!accountId) throw new Error('No active account')
  const account = store.accounts[accountId]
  if (!account?.profile) throw new Error('Load your profile first')

  const profileId = account.profile.id
  const [posts, mentions] = await Promise.all([
    gatherSelfPosts(profileId, opts).catch(() => [] as Post[]),
    gatherSelfMentions(profileId, opts).catch(() => [] as Post[]),
  ])
  const merged = mergePosts(mergePosts(account.posts, posts), mentions)
  useXSelfStore.getState().setPosts(accountId, merged)
  useXSelfStore.getState().markRefreshed(accountId, 'posts')
  useXSelfStore.getState().setEdges(accountId, deriveEdges(profileId, merged))
}

/** Refresh the active account's network: timeline + inbound mentions, re-derive edges. */
export async function refreshSelfNetwork(): Promise<void> {
  await refreshSelfPosts()
}

/**
 * Refresh only the active account's profile (metrics, bio, avatar).
 * Used by the self Profile section's Refresh action when a profile is already loaded.
 */
export async function refreshSelfProfile(): Promise<void> {
  const store = useXSelfStore.getState()
  const accountId = store.activeAccountId
  if (!accountId) throw new Error('No active account')
  const account = store.accounts[accountId]
  const subject = `@${account?.username ?? account?.profile?.username ?? 'you'}`

  const toastId = toast.progress('Refreshing profile', {
    description: subject,
    progress: 0.15,
    progressLabel: 'Looking up user…',
  })

  store.setGathering(accountId, true)
  try {
    const profile = await gatherSelfProfile()
    store.upsertAccount({ id: accountId, username: profile.username })
    store.setProfile(accountId, profile)
    store.markRefreshed(accountId, 'profile')
    toast.complete(toastId, 'Profile updated', `@${profile.username}`)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not refresh profile'
    toast.fail(toastId, 'Refresh failed', message)
    throw e
  } finally {
    useXSelfStore.getState().setGathering(accountId, false)
  }
}

/** Full gather of the connected (active) user: profile → posts → bookmarks → likes → edges. */
export async function gatherSelf(opts: { maxResults?: number } = {}): Promise<void> {
  const store = useXSelfStore.getState()
  const accountId = store.activeAccountId
  if (!accountId) throw new Error('No active account')

  store.setGathering(accountId, true)
  try {
    const profile = await gatherSelfProfile()
    store.upsertAccount({ id: accountId, username: profile.username })
    store.setProfile(accountId, profile)
    store.markRefreshed(accountId, 'profile')

    const [posts, mentions, bookmarks, likes] = await Promise.all([
      gatherSelfPosts(profile.id, opts).catch(() => [] as never[]),
      gatherSelfMentions(profile.id, opts).catch(() => [] as never[]),
      gatherSelfBookmarks(profile.id, opts).catch(() => [] as never[]),
      gatherSelfLikes(profile.id, opts).catch(() => [] as never[]),
    ])

    const account = useXSelfStore.getState().accounts[accountId]
    const mergedPosts = mergePosts(mergePosts(account?.posts ?? [], posts), mentions)
    store.setPosts(accountId, mergedPosts)
    store.markRefreshed(accountId, 'posts')

    store.setBookmarks(accountId, mergePosts(account?.bookmarks ?? [], bookmarks))
    store.markRefreshed(accountId, 'bookmarks')

    store.setLikes(accountId, mergePosts(account?.likes ?? [], likes))
    store.markRefreshed(accountId, 'likes')

    store.setEdges(accountId, deriveEdges(profile.id, mergedPosts))
  } finally {
    useXSelfStore.getState().setGathering(accountId, false)
  }
}

/** Generate a full intelligence report over the connected user's own posts. */
export async function generateSelfReport(): Promise<IntelReportSnapshot> {
  const state = useXSelfStore.getState()
  const accountId = state.activeAccountId
  if (!accountId) throw new Error('No active account')
  if (state.generatingReports[accountId]) {
    throw new Error('A report is already generating for this account')
  }
  const account = state.accounts[accountId]
  if (!account || !account.profile) throw new Error('Load your profile first')
  if (account.posts.length === 0) throw new Error('Gather your posts first')
  const latestReportAt = account.reportHistory[0]?.createdAt
  if (!canGenerateAfterRefresh(latestReportAt, account.refreshedAt?.profile)) {
    throw new Error(GENERATE_NEEDS_REFRESH_HINT)
  }

  // Snapshot inputs so unmount / account switch cannot mid-flight the job.
  const profile = account.profile
  const posts = account.posts
  const edges = account.edges
  const settings = { ...account.synthesisSettings }
  const reportHistory = account.reportHistory

  state.setReportGenerating(accountId, true)
  state.setReportGenerateError(accountId, null)

  const prevSnapshot = reportHistory[0] ?? null
  const hasChangeStep = Boolean(prevSnapshot)
  const subject = profile.username ? `@${profile.username}` : 'Your profile'
  const progress = beginReportProgress({ subject, hasChangeStep })
  await progress.markPrepare()

  try {
    const analytics = computeAnalytics(profile, posts, edges)

    let computedDelta: Omit<ChangeSummary, 'narrative'> | null = null
    if (prevSnapshot) {
      const prevIds = new Set(prevSnapshot.meta.postIdsAnalyzed)
      const newPosts = posts.filter((p) => !prevIds.has(p.id))
      const { own: newOwn, inbound: newInbound } = partitionPosts(profile, newPosts)
      // Cutoff = when the previous report ran. Anything timestamped before then
      // is backfill (older data only now captured), not activity since last report.
      computedDelta = computeDelta(prevSnapshot.analytics, analytics, newOwn, newInbound, prevSnapshot.createdAt)
    }

    const includedIds = new Set(settings.includedReportIds ?? [])
    const includedReports = reportHistory.filter((r) => includedIds.has(r.id))

    const { narrative, changeNarrative, tokenCost, promptTokens, completionTokens } = await synthesizeReport(
      profile, posts, analytics, computedDelta, prevSnapshot, settings, includedReports,
      {
        onPhase: (phase) => progress.markPhase(phase),
        onStreamProgress: ({ phase, receivedTokens, expectedTokens }) => {
          progress.onStreamTokens(phase, receivedTokens, expectedTokens)
        },
      },
    )

    const snapshot: IntelReportSnapshot = {
      id: newReportId(),
      createdAt: new Date().toISOString(),
      model: settings.model,
      synthesisSettings: { ...settings },
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

    useXSelfStore.getState().appendReport(accountId, snapshot)
    // Persist is async (encrypt + localStorage). Await so we don't claim "ready"
    // when the write failed (quota) — that looked like "report failed to save".
    const saved = await flushEncryptedStorage('x-self-profile')
    if (!saved) {
      const msg =
        'Report is in this tab, but browser storage could not save it (often full). It will be lost on reload — free space and generate again.'
      useXSelfStore.getState().setReportGenerateError(accountId, msg)
      progress.fail('Report not saved', msg)
      return snapshot
    }
    progress.complete('Report ready', `${subject} · ${posts.length} posts analyzed`)
    return snapshot
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Report generation failed'
    useXSelfStore.getState().setReportGenerateError(accountId, message)
    progress.fail('Report failed', message)
    throw e
  } finally {
    useXSelfStore.getState().setReportGenerating(accountId, false)
  }
}

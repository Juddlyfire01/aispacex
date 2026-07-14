import { useEffect, useState } from 'react'
import { useXSelfStore } from '../../stores/x-self-store'
import { useSettingsStore } from '../../stores/settings-store'
import { xLogoHrefForTheme } from '../../lib/appearance'
import { gatherSelf, disconnectActiveAccount } from '../../lib/x-intel/self-orchestrate'
import { withRefreshToast } from '../../lib/x-intel/refresh-toast'
import { beginSelfLogin } from '../../lib/x-intel/self-client'
import { linkify } from '../../lib/x-intel/linkify'
import { EthAddressLink } from './eth-address-link'
import { MentionLink } from './mention-link'
import { computeActivity } from '../../lib/x-intel/activity'
import { ProfileOverview } from './profile-overview'
import { SelfReport } from './self-report'
import { SignInWithXButton } from './sign-in-with-x-button'
import { XDataPrivacyDisclosure } from './x-data-privacy-disclosure'
import { XConnectFlow } from './x-connect-flow'
import type { Profile } from '../../lib/x-intel/types'

/** Bio with clickable URLs / mentions / hashtags (mentions open on X here —
 *  the self view has no target concept to add into). */
function SelfBio({ text, bioUrls }: { text: string; bioUrls?: { url: string; expanded: string; display: string }[] }) {
  const linkCls = 'entity-link'
  return (
    <p className="text-[12px] text-white/50 mt-1.5 break-words">
      {linkify(text, bioUrls).map((tok, i) => {
        if (tok.type === 'url' || tok.type === 'hashtag') {
          const href = tok.type === 'url' ? tok.href : `https://x.com/hashtag/${encodeURIComponent(tok.tag)}`
          return <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow" className={linkCls}>{tok.value}</a>
        }
        if (tok.type === 'mention') {
          return <MentionLink key={i} username={tok.username} label={tok.value} />
        }
        if (tok.type === 'eth') {
          return <EthAddressLink key={i} identity={tok.value} />
        }
        return <span key={i}>{tok.value}</span>
      })}
    </p>
  )
}

function ConnectCta() {
  const theme = useSettingsStore((s) => s.theme)
  return (
    <div className="grid h-full min-h-0 grid-rows-[1fr_auto_1fr] px-6 animate-fade-in">
      <div aria-hidden />
      <div className="relative flex items-center justify-center">
        <SignInWithXButton onClick={beginSelfLogin} />
        <div className="absolute bottom-full left-1/2 mb-5 flex w-max max-w-[calc(100vw-3rem)] -translate-x-1/2 flex-col items-center gap-5 text-center">
          <img src={xLogoHrefForTheme(theme)} alt="" className="h-7 w-auto opacity-90" aria-hidden />
          <h2 className="text-[16px] font-semibold text-white/90">Analyze Your Profile</h2>
        </div>
        <div className="absolute top-full left-1/2 z-10 mt-2 w-80 max-w-[calc(100vw-3rem)] -translate-x-1/2">
          <XDataPrivacyDisclosure />
        </div>
      </div>
      <div aria-hidden />
    </div>
  )
}

/** "No account selected" — accounts exist in the rail but none is active (e.g.
 *  just disconnected the last active one and the server hasn't picked a
 *  successor yet). Prompts the user to pick one from the rail. */
function NoActiveAccount() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-6">
      <p className="text-[13px] text-white/50 font-medium">No account selected</p>
      <p className="text-[11px] text-white/30 max-w-xs">Pick an account from the rail, or connect a new one.</p>
    </div>
  )
}

/** Profile sub-tab content for the self ("me") top tab. Renders the two-column
 *  ProfileOverview + SelfReport split for the active connected account. The
 *  rail + Profile/Feed/Network sub-tab bar live in IntelView; this component
 *  is just the "Profile" sub-tab's body. Empty/connecting states overlay the
 *  whole area. */
export function SelfProfileView() {
  const connected = useXSelfStore((s) => s.connected)
  const connecting = useXSelfStore((s) => s.connecting)
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const accountCount = useXSelfStore((s) => s.accountOrder.length)
  const account = useXSelfStore((s) => (s.activeAccountId ? s.accounts[s.activeAccountId] : undefined))
  const gathering = useXSelfStore((s) =>
    s.activeAccountId ? Boolean(s.gatheringAccounts[s.activeAccountId]) : false,
  )
  const setSynthesisSettings = useXSelfStore((s) => s.setSynthesisSettings)

  // The zustand persist middleware hydrates from localStorage asynchronously.
  // On a fresh page load (incl. the OAuth redirect return) the store starts with
  // empty defaults and then re-hydrates a frame or two later. Without tracking
  // this we'd flash "No account" and kick off a redundant gather even when a
  // cached profile exists on disk.
  const [hydrated, setHydrated] = useState(useXSelfStore.persist.hasHydrated())
  useEffect(() => {
    if (hydrated) return
    const unsub = useXSelfStore.persist.onFinishHydration(() => setHydrated(true))
    if (useXSelfStore.persist.hasHydrated()) setHydrated(true)
    return unsub
  }, [hydrated])

  const [error, setError] = useState<string | null>(null)

  const profile = account?.profile ?? null
  const posts = account?.posts ?? []
  const edges = account?.edges ?? []
  const reportHistory = account?.reportHistory ?? []
  const bookmarks = account?.bookmarks ?? []
  const likes = account?.likes ?? []

  // Refresh must pull the full corpus (profile + posts + bookmarks + likes) so
  // newly authored posts land in the store — reports diff against gathered
  // posts, so a profile-only refresh silently freezes the dataset. A progress
  // toast reports the outcome, including how many new posts were pulled in.
  const runRefresh = async () => {
    setError(null)
    const subject = profile?.username ? `@${profile.username}` : 'your profile'
    try {
      await withRefreshToast(
        subject,
        () => gatherSelf(),
        'Profile up to date',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gather failed')
    }
  }

  // After the shared session probe, gather the active account's data — but only
  // once the persist layer has hydrated, otherwise we'd gather even when a
  // cached profile is about to reappear from localStorage.
  useEffect(() => {
    if (!hydrated || !connected || !activeAccountId) return
    const acc = useXSelfStore.getState().accounts[activeAccountId]
    if (acc?.profile) return
    setError(null)
    gatherSelf().catch((e) => setError(e instanceof Error ? e.message : 'Gather failed'))
  }, [hydrated, connected, activeAccountId])

  // OAuth round-trip in flight (click → x.com → return, or session probe still
  // resolving after the callback). Show the authorizing screen instead of the
  // Connect CTA so the user sees the connection process has begun.
  if (connecting) return <XConnectFlow phase="authorizing" />

  // No accounts at all → connect CTA. This covers both the first-time case and
  // the "just deleted my last account" case: zero accounts means there is
  // nothing to select, so show Connect regardless of the `connected` flag (which
  // lags behind removal until the next session probe resolves). Reads the
  // reactive accountCount so this re-evaluates the moment the last one is removed.
  if (accountCount === 0) return <ConnectCta />

  // Accounts exist but none is active yet (genuine transient pick-one state).
  if (!activeAccountId || !account) return <NoActiveAccount />

  // Connected but no profile yet. If we're still waiting on persist hydration,
  // the profile may well be sitting in localStorage about to reappear — show the
  // syncing screen rather than flashing the empty state. Once hydrated (and
  // still no profile), this is the genuine first-gather phase right after OAuth.
  if (!profile) {
    return (
      <XConnectFlow
        phase="syncing"
        busy={gathering || !hydrated}
        error={hydrated ? error : null}
        onRetry={runRefresh}
      />
    )
  }

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
      {/* Left: identity + metrics (shared with the Targets tab) */}
      <div className="flex-1 lg:flex-none lg:w-[340px] lg:shrink-0 lg:border-r border-white/[0.05] min-h-0 overflow-hidden">
        <ProfileOverview
          profile={profile}
          connected={connected}
          refreshing={gathering}
          refreshError={error}
          lastGatheredIso={account.refreshedAt.profile ?? profile.gatheredAt}
          onRefresh={runRefresh}
          emptyHint="Fetch your profile, posts, bookmarks & likes in one pull."
          renderBio={(p: Profile) => <SelfBio text={p.bio ?? ''} bioUrls={p.bioUrls} />}
          gatherExtras={{ bookmarks: bookmarks.length, likes: likes.length }}
          activity={profile ? computeActivity(profile, posts) : null}
          synthesisSettings={account.synthesisSettings}
          postCount={posts.length}
          posts={posts}
          edges={edges}
          reportHistory={reportHistory}
          onSynthesisChange={(patch) => setSynthesisSettings(activeAccountId, patch)}
          footerAction={connected ? { label: 'Disconnect account', onClick: () => { void disconnectActiveAccount() } } : undefined}
        />
      </div>

      {/* Right: report (reuses the target analytics + narrative pipeline).
          `syncing` = a gather is in flight, so the report panel shows a spinner
          instead of "No report yet" until posts land and analytics can compute. */}
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <SelfReport syncing={gathering && posts.length === 0} />
      </div>
    </div>
  )
}

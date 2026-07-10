import { useComposeStore } from '../../stores/compose-store'
import { findReportKey, useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import type { PostTarget } from './types'

/** Jump to the Post tab with a new thread scoped to a target and open the draft drawer. */
export function openComposeForTarget(username: string) {
  const scope = { type: 'target' as const, username: username.replace(/^@/, '') }
  const store = useComposeStore.getState()
  const id = store.createThread(scope)
  store.selectThread(id)
  store.setDraftDrawerOpen(true)
  useXIntelStore.getState().setActiveTopTab('post')
}

/**
 * Open Post with a new draft pre-targeted as a reply (or quote) to a specific
 * post. Best-effort author resolution: local intel stores → active target →
 * empty handle (user can fill in TargetPicker).
 */
export function openComposeForPost(
  postId: string,
  opts?: { username?: string; kind?: 'reply' | 'quote' },
) {
  const kind = opts?.kind ?? 'reply'
  const username = (opts?.username ?? resolvePostAuthor(postId)).replace(/^@/, '')
  const target: PostTarget =
    kind === 'quote'
      ? { kind: 'quote', postId, username }
      : { kind: 'reply', toPostId: postId, toUsername: username }
  const scope = username
    ? ({ type: 'target' as const, username })
    : useComposeStore.getState().newThreadContext
  const store = useComposeStore.getState()
  const id = store.createThread(scope, target)
  store.selectThread(id)
  store.setDraftDrawerOpen(true)
  useXIntelStore.getState().setActiveTopTab('post')
}

/** Look up a post author handle from local self/target intel stores. */
export function resolvePostAuthor(postId: string): string {
  const intel = useXIntelStore.getState()
  for (const username of intel.targets) {
    const key = findReportKey(intel.reports, username)
    const report = key ? intel.reports[key] : undefined
    if (report?.posts.some((p) => p.id === postId)) return username
  }

  const self = useXSelfStore.getState()
  for (const account of Object.values(self.accounts)) {
    if (account.posts.some((p) => p.id === postId) && account.username) {
      return account.username
    }
  }
  // Fallback: active target (common when the model cites bare ids from the
  // open report) or the sole loaded target.
  if (intel.activeTarget) return intel.activeTarget
  if (intel.targets.length === 1) return intel.targets[0]
  return ''
}

/** When entering the Post tab, pre-select the active intel target for the next new chat only. */
export function syncComposeContextFromActiveTarget() {
  const target = useXIntelStore.getState().activeTarget
  if (!target) return
  useComposeStore.getState().setNewThreadContext({ type: 'target', username: target })
}

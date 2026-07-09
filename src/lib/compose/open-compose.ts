import { useComposeStore } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'

/** Jump to the Post tab with a new thread scoped to a target and open the draft drawer. */
export function openComposeForTarget(username: string) {
  const scope = { type: 'target' as const, username: username.replace(/^@/, '') }
  const store = useComposeStore.getState()
  const id = store.createThread(scope)
  store.selectThread(id)
  store.setDraftDrawerOpen(true)
  useXIntelStore.getState().setActiveTopTab('post')
}

/** When entering the Post tab, pre-select the active intel target for the next new chat only. */
export function syncComposeContextFromActiveTarget() {
  const target = useXIntelStore.getState().activeTarget
  if (!target) return
  useComposeStore.getState().setNewThreadContext({ type: 'target', username: target })
}

import { useComposeStore } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'

/** Jump to the Post tab with a new thread scoped to a target. */
export function openComposeForTarget(username: string) {
  useComposeStore.getState().createThread({ type: 'target', username })
  useXIntelStore.getState().setActiveTopTab('post')
}

/** When entering the Post tab, pre-select the active intel target if any. */
export function syncComposeContextFromActiveTarget() {
  const target = useXIntelStore.getState().activeTarget
  if (!target) return
  const store = useComposeStore.getState()
  store.setNewThreadContext({ type: 'target', username: target })
  // Only create a thread if none is active yet.
  if (!store.activeThreadId || !store.threads[store.activeThreadId]) {
    store.createThread({ type: 'target', username: target })
  }
}

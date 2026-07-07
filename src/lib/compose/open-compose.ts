import { useComposeStore } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'

/** Jump to the Post tab with a target loaded as compose context. */
export function openComposeForTarget(username: string) {
  useComposeStore.getState().setActiveContext(username)
  useComposeStore.getState().ensureSession(username)
  useXIntelStore.getState().setActiveTopTab('post')
}

/** When entering the Post tab, pre-select the active intel target if any. */
export function syncComposeContextFromActiveTarget() {
  const target = useXIntelStore.getState().activeTarget
  if (!target) return
  useComposeStore.getState().setActiveContext(target)
  useComposeStore.getState().ensureSession(target)
}

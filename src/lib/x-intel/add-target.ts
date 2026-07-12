import { toast } from '../../stores/toast-store'
import { useXIntelStore, findReportKey } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { runGather } from './orchestrate'

/**
 * Add a profile to the Others rail with toaster feedback (no OS confirm).
 * Soft-gates on X connect; Undo removes the target from the rail.
 */
export function addTargetWithToast(username: string): void {
  const handle = username.replace(/^@/, '').trim()
  if (!handle) return
  const subject = `@${handle}`

  if (!useXSelfStore.getState().connected) {
    toast.info('Connect X', 'Connect your X account (header → Connect X) to add profiles.')
    return
  }

  const { targets, reports, addTarget, removeTarget } = useXIntelStore.getState()
  const lower = handle.toLowerCase()
  const alreadyOnRail = targets.some((t) => t.toLowerCase() === lower)
  if (alreadyOnRail) {
    addTarget(handle) // focuses existing
    toast.info('Already on rail', subject)
    return
  }

  const cached = Boolean(findReportKey(reports, handle))
  addTarget(handle)
  if (!cached) {
    runGather(handle).catch(() => {
      /* gather errors surface in the target rail */
    })
  }

  toast.success('Added to rail', subject, {
    label: 'Undo',
    onClick: () => removeTarget(handle),
  })
}

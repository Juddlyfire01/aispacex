import { toast } from '../../stores/toast-store'
import { PaidNotReadyError } from '../x402/charge-flow'

/**
 * Wrap a refresh action with a progress toast. Deliberately does NOT report a
 * new-post count: a refresh can pull new mentions, updated metrics, bookmarks
 * or likes with zero new own posts, so "no new posts" would misrepresent a pull
 * that did refresh other activity. The toast just confirms the pull completed.
 *
 * `successTitle` lets callers distinguish a full Profile refresh from a
 * section-scoped Feed/Network refresh.
 *
 * Completes only after `action` resolves successfully. On PaidNotReadyError the
 * progress toast is dismissed (wallet toast already fired). Other failures flip
 * the toast to an error and rethrow so callers can set inline error state.
 */
export async function withRefreshToast(
  subject: string,
  action: () => Promise<void>,
  successTitle = 'Up to date',
): Promise<void> {
  const toastId = toast.progress('Refreshing', {
    description: subject,
    progress: 0.15,
    progressLabel: 'Fetching latest…',
  })
  try {
    await action()
    toast.complete(toastId, successTitle, subject)
  } catch (e) {
    if (e instanceof PaidNotReadyError) {
      toast.dismiss(toastId)
      throw e
    }
    const message = e instanceof Error ? e.message : 'Refresh failed'
    toast.fail(toastId, 'Refresh failed', message)
    throw e
  }
}

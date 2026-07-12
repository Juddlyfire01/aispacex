import { toast } from '../../stores/toast-store'

/**
 * Wrap a refresh action with a progress toast. Deliberately does NOT report a
 * new-post count: a refresh can pull new mentions, updated metrics, bookmarks
 * or likes with zero new own posts, so "no new posts" would misrepresent a pull
 * that did refresh other activity. The toast just confirms the pull completed.
 *
 * `successTitle` lets callers distinguish a full Profile refresh from a
 * section-scoped Feed/Network refresh.
 *
 * Rethrows on failure after flipping the toast to an error, so callers can still
 * set their own inline error state.
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
    const message = e instanceof Error ? e.message : 'Refresh failed'
    toast.fail(toastId, 'Refresh failed', message)
    throw e
  }
}

import { toast } from '../../stores/toast-store'

/**
 * Wrap a refresh action with a progress toast that reports how many new posts
 * landed. `getCount` is sampled before and after the action (read live from the
 * store, not a stale closure) so the delta reflects the actual merge outcome.
 *
 * `successTitle` lets callers distinguish a full Profile refresh from a
 * section-scoped Feed/Network refresh while sharing identical delta logic.
 *
 * Rethrows on failure after flipping the toast to an error, so callers can still
 * set their own inline error state.
 */
export async function withRefreshToast(
  subject: string,
  getCount: () => number,
  action: () => Promise<void>,
  successTitle = 'Up to date',
): Promise<void> {
  const before = getCount()
  const toastId = toast.progress('Refreshing', {
    description: subject,
    progress: 0.15,
    progressLabel: 'Fetching latest…',
  })
  try {
    await action()
    const after = getCount()
    const added = Math.max(0, after - before)
    const detail =
      added > 0
        ? `${added} new post${added === 1 ? '' : 's'} · ${after} total`
        : `No new posts · ${after} total`
    toast.complete(toastId, successTitle, detail)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Refresh failed'
    toast.fail(toastId, 'Refresh failed', message)
    throw e
  }
}

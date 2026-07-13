/**
 * Generate-report is only useful after new data lands. First report is always
 * allowed (when posts exist). After that, require a profile refresh newer than
 * the latest report so users cannot burn tokens on back-to-back identical gens.
 *
 * Flow: refresh → generate → refresh → generate → …
 */

export function canGenerateAfterRefresh(
  lastReportCreatedAt: string | null | undefined,
  lastProfileRefreshIso: string | null | undefined,
): boolean {
  if (!lastReportCreatedAt) return true
  if (!lastProfileRefreshIso) return false
  const reportMs = Date.parse(lastReportCreatedAt)
  const refreshMs = Date.parse(lastProfileRefreshIso)
  if (Number.isNaN(reportMs) || Number.isNaN(refreshMs)) return false
  return refreshMs > reportMs
}

export const GENERATE_NEEDS_REFRESH_HINT =
  'Refresh the profile first to pull new data, then generate again'

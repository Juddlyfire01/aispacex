/**
 * Report-context selection helpers. `includedReportIds` is a concrete id list;
 * when the user has MAX (every prior report), appending a new report must grow
 * the list so the cap stays at MAX.
 */

export function isReportContextAtMax(
  includedIds: string[],
  history: { id: string }[],
): boolean {
  if (history.length === 0) return true
  const selected = new Set(includedIds)
  return history.every((r) => selected.has(r.id))
}

/**
 * If selection was MAX over `previousHistory`, return ids for all of those
 * plus `newReportId` (newest first). Otherwise return `includedIds` unchanged.
 */
export function growIncludedReportIdsIfMax(
  includedIds: string[],
  previousHistory: { id: string }[],
  newReportId: string,
): string[] {
  if (!isReportContextAtMax(includedIds, previousHistory)) return includedIds
  if (includedIds.includes(newReportId)) {
    return [newReportId, ...previousHistory.map((r) => r.id).filter((id) => id !== newReportId)]
  }
  return [newReportId, ...previousHistory.map((r) => r.id)]
}

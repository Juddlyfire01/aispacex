/** Stable partition: starred items first (relative order preserved), then the rest. */
export function sortStarredFirst<T>(items: T[], isStarred: (item: T) => boolean): T[] {
  const starred: T[] = []
  const rest: T[] = []
  for (const item of items) {
    if (isStarred(item)) starred.push(item)
    else rest.push(item)
  }
  return starred.length === 0 ? items : [...starred, ...rest]
}

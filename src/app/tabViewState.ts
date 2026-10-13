export function pruneTabState<T>(
  state: Partial<Record<number, T>>,
  openTabIds: Set<number>,
): Partial<Record<number, T>> {
  const entries = Object.entries(state).filter(([id]) => openTabIds.has(Number(id)))
  if (entries.length === Object.keys(state).length) return state
  return Object.fromEntries(entries)
}

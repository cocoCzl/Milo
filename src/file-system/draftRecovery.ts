import { invoke, isTauri } from '@tauri-apps/api/core'

type Draft = { id: string; markdown: string }
const operations = new Map<string, Promise<void>>()
// Per-copy ordering prevents a late autosnapshot resurrecting a discarded copy.
export function queueDraft(id: string, markdown: string | null): Promise<void> {
  if (!isTauri()) return Promise.resolve()
  const operation = (operations.get(id) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => invoke<void>('write_draft_recovery', { id, markdown }))
  operations.set(id, operation)
  void operation
    .finally(() => {
      if (operations.get(id) === operation) operations.delete(id)
    })
    .catch(() => undefined)
  return operation
}
export const flushDrafts = () => Promise.all([...operations.values()])
export const readDrafts = () =>
  isTauri()
    ? invoke<{ drafts: Draft[]; errors: string[] }>('read_draft_recovery')
    : Promise.resolve({ drafts: [], errors: [] })

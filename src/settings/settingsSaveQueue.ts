import type { ApplicationSettings } from './applicationSettings'

type SaveResult = { ok: true } | { ok: false; reason: unknown }

// One in-flight write, one replaceable full-state successor. Failures remain
// visible to the hook; the next update (even the same preference) retries the
// latest complete state. flush retains the existing close contract: await all
// attempts, report errors in preferences, never alter document-close choices.
export function createSettingsSaveQueue(
  save: (settings: ApplicationSettings) => Promise<unknown>,
  settled: (result: SaveResult) => void,
) {
  let pending: ApplicationSettings | null = null
  let active: Promise<void> | null = null
  const start = () => {
    if (active || !pending) return
    active = Promise.resolve()
      .then(async () => {
        while (pending) {
          const next = pending
          pending = null
          let result: SaveResult
          try {
            await save(next)
            result = { ok: true }
          } catch (reason) {
            result = { ok: false, reason }
          }
          if (!pending) settled(result)
        }
      })
      .finally(() => {
        active = null
        // An enqueue between the loop finishing and this microtask must not
        // strand a newer state behind an already completed promise.
        start()
      })
  }
  return {
    enqueue(settings: ApplicationSettings) {
      pending = settings
      start()
    },
    async flush() {
      // Include successors enqueued while an earlier write was being awaited.
      while (active) await active
    },
  }
}

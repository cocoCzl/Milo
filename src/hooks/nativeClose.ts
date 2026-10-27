import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type NativeCloseKind = 'window' | 'quit'
export const listenForNativeClose = (handler: (kind: NativeCloseKind) => void) =>
  listen<NativeCloseKind>('milo://request-close', ({ payload }) => handler(payload)).then(
    async (stop) => {
      try {
        await invoke('close_coordinator_ready')
        return stop
      } catch (reason) {
        stop()
        throw reason
      }
    },
  )
export const completeNativeClose = (kind: NativeCloseKind) => invoke('complete_close', { kind })
export const cancelNativeClose = () => invoke('cancel_close')

// Readiness may replay a pending event (including a StrictMode remount).
// Ignore a replay without cancelling the native request that already owns it.
export function createNativeCloseHandler(
  requestAll: (complete: () => Promise<void>, failed: () => void) => boolean,
  beforeComplete: () => Promise<unknown>,
) {
  let inProgress = false
  const cancel = () => {
    inProgress = false
    return cancelNativeClose()
  }
  return {
    cancel,
    request: (kind: NativeCloseKind) => {
      if (inProgress) return
      inProgress = true
      const accepted = requestAll(
        async () => {
          await beforeComplete()
          await completeNativeClose(kind)
          inProgress = false
        },
        () => void cancel().catch(() => undefined),
      )
      if (!accepted) void cancel().catch(() => undefined)
    },
  }
}

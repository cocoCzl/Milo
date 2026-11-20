import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  flushInputTrace,
  inputTraceEnabled,
  setInputTraceClose,
  traceInput,
} from '../diagnostics/inputTrace'

export type NativeCloseKind = 'window' | 'quit'
type ClosePayload = NativeCloseKind | { kind: NativeCloseKind; traceId: string }
export const listenForNativeClose = (handler: (kind: NativeCloseKind, traceId?: string) => void) =>
  listen<ClosePayload>('milo://request-close', ({ payload }) => {
    if (typeof payload === 'string') handler(payload)
    else handler(payload.kind, payload.traceId)
  }).then(async (stop) => {
    try {
      await invoke('close_coordinator_ready')
      return stop
    } catch (reason) {
      stop()
      throw reason
    }
  })
export const completeNativeClose = async (
  kind: NativeCloseKind,
  current = () => true,
  traceId?: string,
) => {
  if (inputTraceEnabled) {
    traceInput('native:complete-close', { kind, ...(traceId ? { closeId: traceId } : {}) })
    await flushInputTrace('before-close')
  }
  if (!current()) return
  return invoke('complete_close', { kind })
}
export const cancelNativeClose = () => invoke('cancel_close')

// Readiness may replay a pending event (including a StrictMode remount).
// Ignore a replay without cancelling the native request that already owns it.
export function createNativeCloseHandler(
  requestAll: (complete: () => Promise<void>, failed: () => void) => boolean,
  beforeComplete: () => Promise<unknown>,
) {
  let inProgress = false
  let generation = 0
  const cancel = () => {
    traceInput('native:cancel-close')
    setInputTraceClose(null)
    inProgress = false
    generation++
    return cancelNativeClose()
  }
  return {
    cancel,
    request: (kind: NativeCloseKind, traceId?: string) => {
      if (inProgress) {
        traceInput('native:close-replayed', { kind })
        return
      }
      inProgress = true
      const request = ++generation
      const id = traceId ?? `frontend-${request}`
      setInputTraceClose(id)
      traceInput('native:close-request', { kind, generation: request })
      const accepted = requestAll(
        async () => {
          if (generation !== request) return
          traceInput('native:settings-flush-start', { closeId: id })
          await beforeComplete()
          traceInput('native:settings-flush-complete', { closeId: id })
          if (generation !== request) return
          await completeNativeClose(kind, () => generation === request, id)
          if (generation === request) {
            inProgress = false
            setInputTraceClose(null)
          }
        },
        () => {
          if (generation === request) void cancel().catch(() => undefined)
        },
      )
      if (!accepted) void cancel().catch(() => undefined)
    },
  }
}

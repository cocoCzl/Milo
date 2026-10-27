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

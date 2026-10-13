import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// The effect owns the subscription even when native registration outlives it.
// A queued native event must not reach a callback belonging to a stopped effect.
export function subscribeUntilCleanup(eventName: string, onPayload: (payload: string) => void) {
  let stopped = false
  let unlisten: UnlistenFn | undefined
  void listen<string>(eventName, (event) => {
    if (!stopped) onPayload(event.payload)
  })
    .then((stop) => {
      if (stopped) stop()
      else unlisten = stop
    })
    .catch(() => {
      // Registration errors are diagnostic only; do not log document paths or
      // payloads, and do not leave a rejected registration promise unhandled.
      console.error(`Could not register native listener (${eventName}).`)
    })
  return () => {
    stopped = true
    unlisten?.()
    unlisten = undefined
  }
}

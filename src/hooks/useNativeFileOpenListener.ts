import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'

type OpenRequest = { id: number; path: string }

export function useNativeFileOpenListener(onOpenPath: (path: string) => unknown, ready = true) {
  const onOpenPathRef = useRef(onOpenPath)
  onOpenPathRef.current = onOpenPath
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauri() || !ready) return
    let stopped = false
    let running = false
    let requested = false
    let unlisten: (() => void) | undefined
    const drain = async () => {
      requested = true
      if (running || stopped) return
      running = true
      try {
        while (requested && !stopped) {
          requested = false
          const requests = await invoke<OpenRequest[]>('pending_markdown_open_requests')
          for (const request of requests) {
            if (stopped) return
            await onOpenPathRef.current(request.path)
            if (stopped) return
            // A visible read error is also consumed, so later files can open.
            await invoke('acknowledge_markdown_open_request', { id: request.id })
          }
        }
        if (!stopped) setError(null)
      } catch (reason) {
        if (!stopped) setError(`Could not receive file-open requests: ${String(reason)}`)
      } finally {
        running = false
      }
    }
    // Subscribe first, then read the retained queue; wake-ups during slow opens
    // request another pass instead of starting concurrent drains.
    void listen('milo://open-file', () => void drain())
      .then((stop) => {
        if (stopped) stop()
        else {
          unlisten = stop
          void drain()
        }
      })
      .catch((reason) => {
        if (!stopped) setError(`Could not receive file-open requests: ${String(reason)}`)
      })
    return () => {
      stopped = true
      unlisten?.()
    }
  }, [ready])
  return error
}

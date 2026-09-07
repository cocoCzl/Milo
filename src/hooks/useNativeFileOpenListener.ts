import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef } from 'react'

export function useNativeFileOpenListener(onOpenPath: (path: string) => void) {
  const onOpenPathRef = useRef(onOpenPath)
  onOpenPathRef.current = onOpenPath

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    void listen<string>('milo://open-file', (event) => onOpenPathRef.current(event.payload)).then((stop) => {
      unlisten = stop
    })
    return () => unlisten?.()
  }, [])
}

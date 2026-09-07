import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef } from 'react'

export function useNativeCommandListener(onCommand: (command: string) => void) {
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    void listen<string>('milo://command', (event) => onCommandRef.current(event.payload)).then((stop) => {
      unlisten = stop
    })
    return () => unlisten?.()
  }, [])
}

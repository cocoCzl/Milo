import { isTauri } from '@tauri-apps/api/core'
import { useEffect, useRef } from 'react'

import { subscribeUntilCleanup } from './nativeSubscription'

export function useNativeCommandListener(onCommand: (command: string) => void) {
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand

  useEffect(() => {
    if (!isTauri()) return
    return subscribeUntilCleanup('milo://command', (payload) => onCommandRef.current(payload))
  }, [])
}

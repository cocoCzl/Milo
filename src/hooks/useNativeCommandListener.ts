import { isTauri } from '@tauri-apps/api/core'
import { useEffect, useRef } from 'react'

import { subscribeUntilCleanup } from './nativeSubscription'
import { traceInput } from '../diagnostics/inputTrace'

export function useNativeCommandListener(onCommand: (command: string) => void) {
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand

  useEffect(() => {
    if (!isTauri()) return
    return subscribeUntilCleanup('milo://command', (payload) => {
      traceInput('native:command', { command: payload })
      onCommandRef.current(payload)
    })
  }, [])
}

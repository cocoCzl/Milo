import { isTauri } from '@tauri-apps/api/core'
import { useEffect, useRef } from 'react'

import { subscribeUntilCleanup } from './nativeSubscription'

export function useNativeFileOpenListener(onOpenPath: (path: string) => void) {
  const onOpenPathRef = useRef(onOpenPath)
  onOpenPathRef.current = onOpenPath

  useEffect(() => {
    if (!isTauri()) return
    return subscribeUntilCleanup('milo://open-file', (payload) => onOpenPathRef.current(payload))
  }, [])
}

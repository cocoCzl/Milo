import { useEffect, useState } from 'react'

import type { AppearancePreference } from './applicationSettings'

export type ColorScheme = 'light' | 'dark'

const darkSchemeQuery = '(prefers-color-scheme: dark)'

export function useEffectiveColorScheme(preference: AppearancePreference): ColorScheme {
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(getSystemColorScheme)

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(darkSchemeQuery)
    if (!mediaQuery) return

    const updateScheme = () => setSystemScheme(mediaQuery.matches ? 'dark' : 'light')
    updateScheme()
    mediaQuery.addEventListener('change', updateScheme)
    return () => mediaQuery.removeEventListener('change', updateScheme)
  }, [])

  return preference === 'system' ? systemScheme : preference
}

function getSystemColorScheme(): ColorScheme {
  return window.matchMedia?.(darkSchemeQuery).matches ? 'dark' : 'light'
}

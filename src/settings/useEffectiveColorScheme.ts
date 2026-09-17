import { useEffect, useState } from 'react'

import type { AppearancePreference, ResolvedTheme } from './applicationSettings'

export type ColorScheme = ResolvedTheme

const darkSchemeQuery = '(prefers-color-scheme: dark)'

export function useEffectiveColorScheme(preference: AppearancePreference): ResolvedTheme {
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(getSystemColorScheme)

  useEffect(() => {
    if (preference !== 'system') return

    const mediaQuery = window.matchMedia?.(darkSchemeQuery)
    if (!mediaQuery) return

    const updateScheme = () => setSystemScheme(mediaQuery.matches ? 'dark' : 'light')
    updateScheme()
    mediaQuery.addEventListener('change', updateScheme)
    return () => mediaQuery.removeEventListener('change', updateScheme)
  }, [preference])

  return preference === 'system' ? systemScheme : preference
}

function getSystemColorScheme(): ColorScheme {
  return window.matchMedia?.(darkSchemeQuery).matches ? 'dark' : 'light'
}

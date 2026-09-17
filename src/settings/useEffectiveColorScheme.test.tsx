import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useEffectiveColorScheme } from './useEffectiveColorScheme'

let changeListener: ((event: MediaQueryListEvent) => void) | undefined
let dark = false

beforeEach(() => {
  dark = false
  changeListener = undefined
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return dark },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => { changeListener = listener },
    removeEventListener: () => { changeListener = undefined },
  })))
})

afterEach(() => vi.unstubAllGlobals())

describe('useEffectiveColorScheme', () => {
  it('follows operating-system appearance only for system preference', () => {
    const hook = renderHook(({ preference }) => useEffectiveColorScheme(preference), { initialProps: { preference: 'system' as const } })
    expect(hook.result.current).toBe('light')

    act(() => {
      dark = true
      changeListener?.({ matches: true } as MediaQueryListEvent)
    })
    expect(hook.result.current).toBe('dark')
  })

  it.each(['light', 'dark', 'warm'] as const)('keeps %s independent from operating-system appearance', (preference) => {
    const hook = renderHook(() => useEffectiveColorScheme(preference))
    expect(hook.result.current).toBe(preference)
    expect(changeListener).toBeUndefined()
  })
})

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))

import { useNativeFileOpenListener } from './useNativeFileOpenListener'

describe('native file-open listener', () => {
  afterEach(() => vi.clearAllMocks())

  it('forwards a Finder-opened file into the app session', async () => {
    let listener: ((event: { payload: string }) => void) | undefined
    mocks.isTauri.mockReturnValue(true)
    mocks.listen.mockImplementation(async (_event: string, callback: typeof listener) => {
      listener = callback
      return mocks.unlisten
    })
    const onOpenPath = vi.fn()

    renderHook(() => useNativeFileOpenListener(onOpenPath))

    await waitFor(() => expect(mocks.listen).toHaveBeenCalledWith('milo://open-file', expect.any(Function)))
    listener?.({ payload: '/Users/milo/Notes/welcome.md' })

    expect(onOpenPath).toHaveBeenCalledWith('/Users/milo/Notes/welcome.md')
  })

  it('does not register a native listener in browser preview', () => {
    mocks.isTauri.mockReturnValue(false)

    renderHook(() => useNativeFileOpenListener(vi.fn()))

    expect(mocks.listen).not.toHaveBeenCalled()
  })
})

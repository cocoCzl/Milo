import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const settingsBoundary = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}))

vi.mock('./applicationSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./applicationSettings')>()
  return {
    ...actual,
    loadApplicationSettings: settingsBoundary.load,
    saveApplicationSettings: settingsBoundary.save,
  }
})

import { useApplicationSettings } from './useApplicationSettings'

describe('useApplicationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsBoundary.load.mockResolvedValue({ appearance: 'light', locale: 'en', documentZoom: 125 })
    settingsBoundary.save.mockImplementation(async (settings) => settings)
  })

  it('loads persisted settings through the public native boundary', async () => {
    const hook = renderHook(() => useApplicationSettings())

    await waitFor(() => expect(hook.result.current.settings).toEqual({
      settingsVersion: 3, appearance: 'light', locale: 'en', documentZoom: 125, interfaceZoom: 120,
      currentFolder: null, recentFiles: [], recentFolders: [], sidebarVisible: true, sidebarWidth: 240,
      startupSession: { activeDocumentPath: null, openDocumentPaths: [] },
    }))
    expect(settingsBoundary.load).toHaveBeenCalledOnce()
  })

  it('persists the newest valid preference after rapid changes', async () => {
    const hook = renderHook(() => useApplicationSettings())

    await act(async () => {
      hook.result.current.setAppearance('dark')
      hook.result.current.setLocale('zh-CN')
      hook.result.current.setDocumentZoom(999)
      hook.result.current.setInterfaceZoom(999)
    })

    expect(hook.result.current.settings).toEqual({
      settingsVersion: 3, appearance: 'dark', locale: 'zh-CN', documentZoom: 160, interfaceZoom: 140,
      currentFolder: null, recentFiles: [], recentFolders: [], sidebarVisible: true, sidebarWidth: 240,
      startupSession: { activeDocumentPath: null, openDocumentPaths: [] },
    })
    await waitFor(() => expect(settingsBoundary.save).toHaveBeenLastCalledWith(expect.objectContaining({
      appearance: 'dark', locale: 'zh-CN', documentZoom: 160, interfaceZoom: 140,
    })))
  })
})

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
      settingsVersion: 4, appearance: 'light', locale: 'en', documentZoom: 125, interfaceZoom: 120,
      currentFolder: null, recentFiles: [], recentFolders: [], sidebarVisible: true, sidebarWidth: 224,
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
      settingsVersion: 4, appearance: 'dark', locale: 'zh-CN', documentZoom: 160, interfaceZoom: 140,
      currentFolder: null, recentFiles: [], recentFolders: [], sidebarVisible: true, sidebarWidth: 224,
      startupSession: { activeDocumentPath: null, openDocumentPaths: [] },
    })
    await waitFor(() => expect(settingsBoundary.save).toHaveBeenLastCalledWith(expect.objectContaining({
      appearance: 'dark', locale: 'zh-CN', documentZoom: 160, interfaceZoom: 140,
    })))
  })

  it('persists the independent warm appearance preference', async () => {
    const hook = renderHook(() => useApplicationSettings())

    await act(async () => {
      hook.result.current.setAppearance('warm')
    })

    expect(hook.result.current.settings.appearance).toBe('warm')
    await waitFor(() => expect(settingsBoundary.save).toHaveBeenLastCalledWith(expect.objectContaining({ appearance: 'warm' })))
  })

  it('normalizes legacy oversized widths while preserving valid custom widths', async () => {
    settingsBoundary.load.mockResolvedValue({ sidebarWidth: 420 })
    const legacy = renderHook(() => useApplicationSettings())
    await waitFor(() => expect(legacy.result.current.settings.sidebarWidth).toBe(320))
    legacy.unmount()

    settingsBoundary.load.mockResolvedValue({ sidebarWidth: 240 })
    const oldDefault = renderHook(() => useApplicationSettings())
    await waitFor(() => expect(oldDefault.result.current.settings.sidebarWidth).toBe(240))
    oldDefault.unmount()

    settingsBoundary.load.mockResolvedValue({ sidebarWidth: 280 })
    const custom = renderHook(() => useApplicationSettings())
    await waitFor(() => expect(custom.result.current.settings.sidebarWidth).toBe(280))
  })
})

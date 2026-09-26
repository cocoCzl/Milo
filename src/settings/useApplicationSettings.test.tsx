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
      settingsVersion: 5, appearance: 'light', locale: 'en', documentZoom: 125, interfaceZoom: 120,
      documentFontStyle: 'sans', readingWidth: 'standard', lineHeight: 'standard',
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
      settingsVersion: 5, appearance: 'dark', locale: 'zh-CN', documentZoom: 160, interfaceZoom: 140,
      documentFontStyle: 'sans', readingWidth: 'standard', lineHeight: 'standard',
      currentFolder: null, recentFiles: [], recentFolders: [], sidebarVisible: true, sidebarWidth: 224,
      startupSession: { activeDocumentPath: null, openDocumentPaths: [] },
    })
    await waitFor(() => expect(settingsBoundary.save).toHaveBeenLastCalledWith(expect.objectContaining({
      appearance: 'dark', locale: 'zh-CN', documentZoom: 160, interfaceZoom: 140,
    })))
  })

  it('persists reading preferences independently from document content state', async () => {
    const hook = renderHook(() => useApplicationSettings())

    await act(async () => {
      hook.result.current.setDocumentFontStyle('serif')
      hook.result.current.setReadingWidth('wide')
      hook.result.current.setLineHeight('relaxed')
    })

    expect(hook.result.current.settings).toEqual(expect.objectContaining({
      documentFontStyle: 'serif', readingWidth: 'wide', lineHeight: 'relaxed',
    }))
    await waitFor(() => expect(settingsBoundary.save).toHaveBeenLastCalledWith(expect.objectContaining({
      documentFontStyle: 'serif', readingWidth: 'wide', lineHeight: 'relaxed',
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

  it('migrates v4 reading defaults and normalizes invalid values without replacing existing settings', async () => {
    settingsBoundary.load.mockResolvedValue({
      settingsVersion: 4,
      appearance: 'warm',
      locale: 'zh-CN',
      documentZoom: 130,
      interfaceZoom: 125,
      documentFontStyle: 'comic',
      readingWidth: 920,
      lineHeight: 'double',
      currentFolder: '/notes',
      recentFiles: ['/notes/a.md'],
      recentFolders: ['/notes'],
      sidebarVisible: false,
      sidebarWidth: 280,
      startupSession: { activeDocumentPath: '/notes/a.md', openDocumentPaths: ['/notes/a.md'] },
    })
    const hook = renderHook(() => useApplicationSettings())

    await waitFor(() => expect(hook.result.current.settings).toEqual({
      settingsVersion: 5,
      appearance: 'warm',
      locale: 'zh-CN',
      documentZoom: 130,
      interfaceZoom: 125,
      documentFontStyle: 'sans',
      readingWidth: 'standard',
      lineHeight: 'standard',
      currentFolder: '/notes',
      recentFiles: ['/notes/a.md'],
      recentFolders: ['/notes'],
      sidebarVisible: false,
      sidebarWidth: 280,
      startupSession: { activeDocumentPath: '/notes/a.md', openDocumentPaths: ['/notes/a.md'] },
    }))
  })
})

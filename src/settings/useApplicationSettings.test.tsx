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
    settingsBoundary.load.mockResolvedValue({
      appearance: 'light',
      locale: 'en',
      documentZoom: 125,
    })
    settingsBoundary.save.mockImplementation(async (settings) => settings)
  })

  it('loads persisted settings through the public native boundary', async () => {
    const hook = renderHook(() => useApplicationSettings())

    await waitFor(() =>
      expect(hook.result.current.settings).toEqual({
        settingsVersion: 5,
        appearance: 'light',
        locale: 'en',
        documentZoom: 125,
        interfaceZoom: 120,
        documentFontStyle: 'sans',
        readingWidth: 'standard',
        lineHeight: 'standard',
        currentFolder: null,
        recentFiles: [],
        recentFolders: [],
        sidebarVisible: true,
        sidebarWidth: 224,
        startupSession: { activeDocumentPath: null, openDocumentPaths: [] },
      }),
    )
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
      settingsVersion: 5,
      appearance: 'dark',
      locale: 'zh-CN',
      documentZoom: 160,
      interfaceZoom: 140,
      documentFontStyle: 'sans',
      readingWidth: 'standard',
      lineHeight: 'standard',
      currentFolder: null,
      recentFiles: [],
      recentFolders: [],
      sidebarVisible: true,
      sidebarWidth: 224,
      startupSession: { activeDocumentPath: null, openDocumentPaths: [] },
    })
    await waitFor(() =>
      expect(settingsBoundary.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          appearance: 'dark',
          locale: 'zh-CN',
          documentZoom: 160,
          interfaceZoom: 140,
        }),
      ),
    )
    expect(settingsBoundary.save).toHaveBeenCalledTimes(1)
  })

  it('merges fields during an active write and flush waits for the newest startup session', async () => {
    const hook = renderHook(() => useApplicationSettings())
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    let release!: () => void
    settingsBoundary.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    act(() => hook.result.current.setAppearance('dark'))
    await waitFor(() => expect(settingsBoundary.save).toHaveBeenCalledTimes(1))
    let flush!: Promise<void>
    act(() => {
      flush = hook.result.current.flushSettings()
      hook.result.current.setLocale('zh-CN')
      hook.result.current.updateWorkspaceSettings({ sidebarVisible: false })
      hook.result.current.setStartupSession({
        activeDocumentPath: '/notes/final.md',
        openDocumentPaths: ['/notes/final.md'],
      })
    })
    expect(hook.result.current.settings).toMatchObject({
      appearance: 'dark',
      locale: 'zh-CN',
      sidebarVisible: false,
    })
    await act(async () => {
      release()
      await flush
    })
    expect(settingsBoundary.save).toHaveBeenCalledTimes(2)
    expect(settingsBoundary.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appearance: 'dark',
        locale: 'zh-CN',
        sidebarVisible: false,
        startupSession: {
          activeDocumentPath: '/notes/final.md',
          openDocumentPaths: ['/notes/final.md'],
        },
      }),
    )
    hook.unmount()
  })

  it('keeps failed preferences in memory and recovers by choosing the same value again', async () => {
    const hook = renderHook(() => useApplicationSettings())
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    settingsBoundary.save.mockRejectedValueOnce('preferences denied')
    await act(async () => {
      hook.result.current.setAppearance('dark')
      await hook.result.current.flushSettings()
    })
    expect(hook.result.current.settings.appearance).toBe('dark')
    expect(hook.result.current.settingsError).toBe('preferences denied')
    await act(async () => {
      hook.result.current.setAppearance('dark')
      await hook.result.current.flushSettings()
    })
    expect(hook.result.current.settingsError).toBeNull()
    expect(settingsBoundary.save).toHaveBeenCalledTimes(2)
    expect(settingsBoundary.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ appearance: 'dark' }),
    )
    hook.unmount()
  })

  it('derives consecutive workspace changes from the latest state before React rerenders', async () => {
    const hook = renderHook(() => useApplicationSettings())
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(async () => {
      hook.result.current.updateWorkspaceSettings({ sidebarWidth: 280, recentFiles: ['/a.md'] })
      hook.result.current.updateWorkspaceSettings((current) => ({
        sidebarVisible: !current.sidebarVisible,
      }))
      hook.result.current.updateWorkspaceSettings((current) => ({
        recentFiles: ['/b.md', ...current.recentFiles],
      }))
      hook.result.current.updateWorkspaceSettings((current) => ({
        sidebarVisible: !current.sidebarVisible,
      }))
      await hook.result.current.flushSettings()
    })
    expect(settingsBoundary.save).toHaveBeenCalledOnce()
    expect(settingsBoundary.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sidebarWidth: 280,
        sidebarVisible: true,
        recentFiles: ['/b.md', '/a.md'],
      }),
    )
    hook.unmount()
  })

  it('persists reading preferences independently from document content state', async () => {
    const hook = renderHook(() => useApplicationSettings())

    await act(async () => {
      hook.result.current.setDocumentFontStyle('serif')
      hook.result.current.setReadingWidth('wide')
      hook.result.current.setLineHeight('relaxed')
    })

    expect(hook.result.current.settings).toEqual(
      expect.objectContaining({
        documentFontStyle: 'serif',
        readingWidth: 'wide',
        lineHeight: 'relaxed',
      }),
    )
    await waitFor(() =>
      expect(settingsBoundary.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          documentFontStyle: 'serif',
          readingWidth: 'wide',
          lineHeight: 'relaxed',
        }),
      ),
    )
  })

  it('persists the independent warm appearance preference', async () => {
    const hook = renderHook(() => useApplicationSettings())

    await act(async () => {
      hook.result.current.setAppearance('warm')
    })

    expect(hook.result.current.settings.appearance).toBe('warm')
    await waitFor(() =>
      expect(settingsBoundary.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ appearance: 'warm' }),
      ),
    )
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

    await waitFor(() =>
      expect(hook.result.current.settings).toEqual({
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
      }),
    )
  })
  it.each([
    ['native string', 'Preference storage is unavailable', 'Preference storage is unavailable'],
    ['Error', new Error('Preferences denied'), 'Preferences denied'],
    ['empty string', '', 'Could not save Milo preferences.'],
    ['empty Error', new Error(''), 'Could not save Milo preferences.'],
    ['unknown object', { message: 'untrusted shape' }, 'Could not save Milo preferences.'],
  ])(
    'reports a save failure from %s without rolling back the selected preference',
    async (_label, reason, message) => {
      settingsBoundary.save.mockRejectedValueOnce(reason)
      const hook = renderHook(() => useApplicationSettings())
      await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
      act(() => hook.result.current.setAppearance('dark'))
      await waitFor(() => expect(hook.result.current.settingsError).toBe(message))
      expect(hook.result.current.settings.appearance).toBe('dark')
      hook.unmount()
    },
  )

  it('preserves a native string when loading preferences fails', async () => {
    settingsBoundary.load.mockRejectedValueOnce('Preference storage could not be read')
    const hook = renderHook(() => useApplicationSettings())
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    expect(hook.result.current.settingsError).toBe('Preference storage could not be read')
    hook.unmount()
  })
  it('restores twenty document paths without mounting them or truncating the session to recent-file count', async () => {
    const paths = Array.from({ length: 20 }, (_, index) => `/notes/tab-${index}.md`)
    settingsBoundary.load.mockResolvedValue({
      startupSession: { activeDocumentPath: paths[19], openDocumentPaths: paths },
    })
    const hook = renderHook(() => useApplicationSettings())
    await waitFor(() =>
      expect(hook.result.current.settings.startupSession.openDocumentPaths).toEqual(paths),
    )
    expect(hook.result.current.settings.startupSession.activeDocumentPath).toBe(paths[19])
  })
})

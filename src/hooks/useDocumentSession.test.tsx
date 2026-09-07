import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pickMarkdownFile: vi.fn(),
  pickMarkdownSavePath: vi.fn(),
  readMarkdownFile: vi.fn(),
  watchMarkdownFile: vi.fn(),
  writeImageAsset: vi.fn(),
  writeMarkdownFile: vi.fn(),
}))

vi.mock('../file-system/nativeMarkdownFile', () => ({
  pickMarkdownFile: mocks.pickMarkdownFile,
  pickMarkdownSavePath: mocks.pickMarkdownSavePath,
  readMarkdownFile: mocks.readMarkdownFile,
  writeImageAsset: mocks.writeImageAsset,
  writeMarkdownFile: mocks.writeMarkdownFile,
}))

vi.mock('../file-system/nativeFileWatcher', () => ({
  watchMarkdownFile: mocks.watchMarkdownFile,
}))

import { useDocumentSession } from './useDocumentSession'

const path = '/tmp/milo-note.md'

describe('useDocumentSession', () => {
  let fileOnDisk = '# Before\n'
  let notifyChange: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    fileOnDisk = '# Before\n'
    notifyChange = undefined
    mocks.pickMarkdownFile.mockResolvedValue(path)
    mocks.readMarkdownFile.mockImplementation(async () => ({
      path,
      markdown: fileOnDisk,
      lineEnding: 'lf' as const,
      hasBom: false,
    }))
    mocks.writeMarkdownFile.mockImplementation(async (document) => {
      fileOnDisk = document.markdown
      return { ...document }
    })
    mocks.writeImageAsset.mockResolvedValue({ path: '/tmp/assets/image.png', relativePath: 'assets/image.png' })
    mocks.watchMarkdownFile.mockImplementation(async (_path, onChange) => {
      notifyChange = onChange
      return async () => undefined
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function openSavedDocument() {
    const session = renderHook(() => useDocumentSession())

    await act(async () => {
      await session.result.current.openDocument()
    })

    await waitFor(() => expect(notifyChange).toBeTypeOf('function'))
    return session
  }

  it('auto-saves a changed saved document, but never writes an unsaved document', async () => {
    const unsaved = renderHook(() => useDocumentSession())

    act(() => {
      unsaved.result.current.updateMarkdown('# Draft')
    })
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
    unsaved.unmount()

    const session = await openSavedDocument()
    vi.useFakeTimers()
    act(() => {
      session.result.current.updateMarkdown('# After')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(mocks.writeMarkdownFile).toHaveBeenCalledWith(expect.objectContaining({
      path,
      markdown: '# After',
    }))
    expect(session.result.current.document.isDirty).toBe(false)
    expect(session.result.current.saveFeedback).toBe('saved')
    vi.useRealTimers()
  })

  it('ignores its own watcher event, reloads clean changes, and pauses a dirty conflict', async () => {
    const session = await openSavedDocument()

    act(() => {
      session.result.current.updateMarkdown('# Local')
    })
    await act(async () => {
      await session.result.current.saveDocument()
    })
    act(() => notifyChange?.())
    await waitFor(() => expect(session.result.current.externalChange).toBeNull())
    act(() => notifyChange?.())
    await waitFor(() => expect(session.result.current.notice).toBeNull())

    fileOnDisk = '# External clean'
    act(() => notifyChange?.())
    await waitFor(() => {
      expect(session.result.current.document.markdown).toBe('# External clean')
      expect(session.result.current.notice).toBe('Reloaded external change.')
    })

    act(() => {
      session.result.current.updateMarkdown('# Keep this local')
    })
    fileOnDisk = '# External conflict'
    act(() => notifyChange?.())
    await waitFor(() => expect(session.result.current.externalChange).toBe('pending'))

    act(() => {
      session.result.current.retainLocalChanges()
    })
    expect(session.result.current.externalChange).toBe('retained')

    await act(async () => {
      await session.result.current.overwriteExternalChange()
    })
    expect(fileOnDisk).toBe('# Keep this local')
    expect(session.result.current.externalChange).toBeNull()
  })

  it('reloads the external version on request and preserves local text after a write failure', async () => {
    const session = await openSavedDocument()

    act(() => {
      session.result.current.updateMarkdown('# Local')
    })
    fileOnDisk = '# External'
    act(() => notifyChange?.())
    await waitFor(() => expect(session.result.current.externalChange).toBe('pending'))

    await act(async () => {
      await session.result.current.reloadExternalChange()
    })
    expect(session.result.current.document.markdown).toBe('# External')
    expect(session.result.current.document.isDirty).toBe(false)

    act(() => {
      session.result.current.updateMarkdown('# Recoverable local text')
    })
    mocks.writeMarkdownFile.mockRejectedValueOnce(new Error('Disk full'))
    await act(async () => {
      await session.result.current.saveDocument()
    })
    expect(session.result.current.document.markdown).toBe('# Recoverable local text')
    expect(session.result.current.document.isDirty).toBe(true)
    expect(session.result.current.error).toBe('Disk full')

    act(() => {
      session.result.current.requestCloseTab(session.result.current.activeTabId)
    })
    expect(session.result.current.closingTabId).toBe(session.result.current.activeTabId)
    act(() => {
      session.result.current.cancelCloseTab()
    })
    expect(session.result.current.closingTabId).toBeNull()
  })

  it('keeps document state isolated while switching and closing tabs', async () => {
    const paths = ['/tmp/first.md', '/tmp/second.md']
    const files = new Map([
      [paths[0], '# First'],
      [paths[1], '# Second'],
    ])
    mocks.pickMarkdownFile
      .mockResolvedValueOnce(paths[0])
      .mockResolvedValueOnce(paths[1])
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
      path: requestedPath,
      markdown: files.get(requestedPath) ?? '',
      lineEnding: 'lf' as const,
      hasBom: false,
    }))

    const session = renderHook(() => useDocumentSession())
    await act(async () => {
      await session.result.current.openDocument()
      await session.result.current.openDocument()
    })

    const firstTab = session.result.current.tabs.find((tab) => tab.document.path === paths[0])!
    const secondTab = session.result.current.tabs.find((tab) => tab.document.path === paths[1])!
    expect(session.result.current.tabs).toHaveLength(3)

    act(() => {
      session.result.current.selectTab(firstTab.id)
    })
    act(() => {
      session.result.current.updateMarkdown('# First local')
    })
    act(() => {
      session.result.current.selectTab(secondTab.id)
    })
    act(() => {
      session.result.current.updateMarkdown('# Second local')
    })

    expect(session.result.current.tabs.find((tab) => tab.id === firstTab.id)?.document.markdown).toBe('# First local')
    expect(session.result.current.tabs.find((tab) => tab.id === secondTab.id)?.document.markdown).toBe('# Second local')

    act(() => {
      session.result.current.requestCloseTab(firstTab.id)
    })
    expect(session.result.current.closingTabId).toBe(firstTab.id)
    act(() => {
      session.result.current.discardAndCloseTab()
    })

    expect(session.result.current.tabs.find((tab) => tab.id === firstTab.id)).toBeUndefined()
    expect(session.result.current.tabs.find((tab) => tab.id === secondTab.id)?.document.markdown).toBe('# Second local')
  })

  it('opens a tree file once, then activates its existing tab', async () => {
    const session = renderHook(() => useDocumentSession())

    await act(async () => {
      await session.result.current.openDocumentAtPath(path)
    })
    const fileTab = session.result.current.tabs.find((tab) => tab.document.path === path)!
    expect(session.result.current.tabs).toHaveLength(2)

    act(() => {
      session.result.current.selectTab(session.result.current.tabs[0].id)
    })
    await act(async () => {
      await session.result.current.openDocumentAtPath(path)
    })

    expect(session.result.current.tabs).toHaveLength(2)
    expect(session.result.current.activeTabId).toBe(fileTab.id)
  })

  it('restores saved files and safely skips unavailable session paths', async () => {
    const availablePath = '/tmp/restored.md'
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => {
      if (requestedPath !== availablePath) throw new Error('Not found')
      return { path: availablePath, markdown: '# Restored', lineEnding: 'lf' as const, hasBom: false }
    })
    const session = renderHook(() => useDocumentSession())

    await act(async () => {
      await session.result.current.restoreStartupSession({
        activeDocumentPath: availablePath,
        openDocumentPaths: [availablePath, '/tmp/missing.md'],
      })
    })

    expect(session.result.current.tabs).toHaveLength(1)
    expect(session.result.current.document.path).toBe(availablePath)
    expect(session.result.current.document.markdown).toBe('# Restored')
  })

  it('keeps the focused untitled document for an empty startup session', async () => {
    const session = renderHook(() => useDocumentSession())
    const initialId = session.result.current.activeTabId

    await act(async () => {
      await session.result.current.restoreStartupSession({ activeDocumentPath: null, openDocumentPaths: [] })
    })

    expect(session.result.current.tabs).toHaveLength(1)
    expect(session.result.current.activeTabId).toBe(initialId)
    expect(session.result.current.document.path).toBeNull()
  })

  it('writes a pasted image only after a document has a saved path', async () => {
    const unsaved = renderHook(() => useDocumentSession())
    mocks.pickMarkdownSavePath.mockResolvedValue(null)

    await act(async () => {
      await expect(unsaved.result.current.pasteImage({ bytes: [137, 80], mimeType: 'image/png' })).resolves.toBeNull()
    })
    expect(mocks.writeImageAsset).not.toHaveBeenCalled()
    unsaved.unmount()

    const session = await openSavedDocument()
    await act(async () => {
      await expect(session.result.current.pasteImage({ bytes: [137, 80], mimeType: 'image/png' })).resolves.toBe('assets/image.png')
    })
    expect(mocks.writeImageAsset).toHaveBeenCalledWith(path, { bytes: [137, 80], mimeType: 'image/png' })
  })
})

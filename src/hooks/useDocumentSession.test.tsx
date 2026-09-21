import { act, renderHook, waitFor } from '@testing-library/react'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pickMarkdownFile: vi.fn(),
  pickMarkdownSavePath: vi.fn(),
  recoverAndReadMarkdownFile: vi.fn(),
  readMarkdownFile: vi.fn(),
  usesMacOSSafeSaveV2: vi.fn(),
  watchMarkdownFile: vi.fn(),
  writeImageAsset: vi.fn(),
  writeMarkdownFile: vi.fn(),
  writeMarkdownFileSafely: vi.fn(),
}))

vi.mock('../file-system/nativeMarkdownFile', () => ({
  pickMarkdownFile: mocks.pickMarkdownFile,
  pickMarkdownSavePath: mocks.pickMarkdownSavePath,
  recoverAndReadMarkdownFile: mocks.recoverAndReadMarkdownFile,
  readMarkdownFile: mocks.readMarkdownFile,
  usesMacOSSafeSaveV2: mocks.usesMacOSSafeSaveV2,
  writeImageAsset: mocks.writeImageAsset,
  writeMarkdownFile: mocks.writeMarkdownFile,
  writeMarkdownFileSafely: mocks.writeMarkdownFileSafely,
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
    mocks.recoverAndReadMarkdownFile.mockImplementation(async (requestedPath) => mocks.readMarkdownFile(requestedPath))
    mocks.usesMacOSSafeSaveV2.mockReturnValue(false)
    mocks.writeMarkdownFile.mockImplementation(async (document) => {
      fileOnDisk = document.markdown
      return { ...document }
    })
    mocks.writeMarkdownFileSafely.mockImplementation(async (document) => {
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

  function updateActive(session: { result: { current: ReturnType<typeof useDocumentSession> } }, markdown: string) {
    const tab = session.result.current.tabs.find((item) => item.id === session.result.current.activeTabId)!
    session.result.current.updateMarkdown({ tabId: tab.id, documentId: tab.document.id, path: tab.document.path }, markdown)
  }

  function originFor(session: { result: { current: ReturnType<typeof useDocumentSession> } }, tabId: number) {
    const tab = session.result.current.tabs.find((item) => item.id === tabId)!
    return { tabId: tab.id, documentId: tab.document.id, path: tab.document.path }
  }

  it('auto-saves a changed saved document, but never writes an unsaved document', async () => {
    const unsaved = renderHook(() => useDocumentSession())

    act(() => {
      updateActive(unsaved, '# Draft')
    })
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
    unsaved.unmount()

    const session = await openSavedDocument()
    vi.useFakeTimers()
    act(() => {
      updateActive(session, '# After')
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

  it('creates a new macOS document through Safe Save without using the atomic replacement writer', async () => {
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    mocks.pickMarkdownSavePath.mockResolvedValue('/tmp/new.md')
    const session = renderHook(() => useDocumentSession())

    act(() => updateActive(session, '# New'))
    await act(async () => { await session.result.current.saveDocument() })

    expect(mocks.writeMarkdownFileSafely).toHaveBeenCalledWith(
      { path: '/tmp/new.md', markdown: '# New', lineEnding: 'lf', hasBom: false },
      null,
    )
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
    expect(session.result.current.document.isDirty).toBe(false)
  })

  it('recovers an ordinary macOS document before load and autosaves it with the persisted disk version', async () => {
    const safePath = '/tmp/ordinary.md'
    mocks.pickMarkdownFile.mockResolvedValue(safePath)
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
      path: requestedPath,
      markdown: '# Before\n',
      lineEnding: 'lf' as const,
      hasBom: false,
    }))

    const session = await openSavedDocument()
    vi.useFakeTimers()
    act(() => updateActive(session, '# After\n'))
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

    expect(mocks.recoverAndReadMarkdownFile).toHaveBeenCalledWith(safePath)
    expect(mocks.writeMarkdownFileSafely).toHaveBeenCalledWith(
      { path: safePath, markdown: '# After\n', lineEnding: 'lf', hasBom: false },
      { path: safePath, markdown: '# Before\n', lineEnding: 'lf', hasBom: false },
    )
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
    expect(session.result.current.document.isDirty).toBe(false)
  })

  it('keeps a macOS document dirty and enters the conflict flow when Rust rejects an external change', async () => {
    const safePath = '/tmp/ordinary.md'
    mocks.pickMarkdownFile.mockResolvedValue(safePath)
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
      path: requestedPath,
      markdown: '# Before\n',
      lineEnding: 'lf' as const,
      hasBom: false,
    }))
    mocks.writeMarkdownFileSafely.mockRejectedValueOnce('Safe Save external change conflict: disk content no longer matches the session version.')
    const session = await openSavedDocument()

    act(() => updateActive(session, '# Local'))
    await act(async () => { await session.result.current.saveDocument() })

    expect(session.result.current.document.isDirty).toBe(true)
    expect(session.result.current.externalChange).toBe('pending')
    expect(session.result.current.error).toBeNull()
  })

  it('ignores its own watcher event, reloads clean changes, and pauses a dirty conflict', async () => {
    const session = await openSavedDocument()

    act(() => {
      updateActive(session, '# Local')
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
      updateActive(session, '# Keep this local')
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
      updateActive(session, '# Local')
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
      updateActive(session, '# Recoverable local text')
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
      updateActive(session, '# First local')
    })
    act(() => {
      session.result.current.selectTab(secondTab.id)
    })
    act(() => {
      updateActive(session, '# Second local')
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

  it('routes a delayed editor callback to its origin, not the tab selected meanwhile', async () => {
    const paths = ['/tmp/origin-a.md', '/tmp/origin-b.md']
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
      path: requestedPath,
      markdown: requestedPath === paths[0] ? 'A0' : 'B0',
      lineEnding: 'lf' as const,
      hasBom: false,
    }))
    const session = renderHook(() => useDocumentSession())
    await act(async () => {
      await session.result.current.openDocumentAtPath(paths[0])
      await session.result.current.openDocumentAtPath(paths[1])
    })
    const tabA = session.result.current.tabs.find((tab) => tab.document.path === paths[0])!
    const tabB = session.result.current.tabs.find((tab) => tab.document.path === paths[1])!
    const originA = originFor(session, tabA.id)

    act(() => session.result.current.selectTab(tabB.id))
    act(() => session.result.current.updateMarkdown(originA, 'A1'))

    expect(session.result.current.tabs.find((tab) => tab.id === tabA.id)?.document.markdown).toBe('A1')
    expect(session.result.current.tabs.find((tab) => tab.id === tabB.id)?.document.markdown).toBe('B0')
  })

  it('autosaves the originating file after a tab switch and preserves byte-for-byte isolation on disk', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'milo-origin-autosave-'))
    const paths = [join(directory, 'A.md'), join(directory, 'B.md')]
    writeFileSync(paths[0], 'A0\n', 'utf8')
    writeFileSync(paths[1], 'B0\n', 'utf8')
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
      path: requestedPath,
      markdown: readFileSync(requestedPath, 'utf8'),
      lineEnding: 'lf' as const,
      hasBom: false,
    }))
    mocks.writeMarkdownFile.mockImplementation(async (document) => {
      writeFileSync(document.path, document.markdown, 'utf8')
      return { ...document }
    })
    const session = renderHook(() => useDocumentSession())
    try {
      await act(async () => {
        await session.result.current.openDocumentAtPath(paths[0])
        await session.result.current.openDocumentAtPath(paths[1])
      })
      const tabA = session.result.current.tabs.find((tab) => tab.document.path === paths[0])!
      const tabB = session.result.current.tabs.find((tab) => tab.document.path === paths[1])!
      vi.useFakeTimers()
      act(() => session.result.current.updateMarkdown(originFor(session, tabA.id), 'A1'))
      act(() => session.result.current.selectTab(tabB.id))

      await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

      expect(readFileSync(paths[0], 'utf8')).toBe('A1')
      expect(readFileSync(paths[1], 'utf8')).toBe('B0\n')
      expect(session.result.current.tabs.find((tab) => tab.id === tabB.id)?.document.markdown).toBe('B0\n')
    } finally {
      vi.useRealTimers()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('ignores stale callbacks and cancels pending autosave after their origin tab closes', async () => {
    const paths = ['/tmp/closed-a.md', '/tmp/closed-b.md']
    const disk = new Map([[paths[0], 'A0'], [paths[1], 'B0']])
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({ path: requestedPath, markdown: disk.get(requestedPath)!, lineEnding: 'lf' as const, hasBom: false }))
    mocks.writeMarkdownFile.mockImplementation(async (document) => {
      disk.set(document.path, document.markdown)
      return { ...document }
    })
    const session = renderHook(() => useDocumentSession())
    await act(async () => {
      await session.result.current.openDocumentAtPath(paths[0])
      await session.result.current.openDocumentAtPath(paths[1])
    })
    const tabA = session.result.current.tabs.find((tab) => tab.document.path === paths[0])!
    const tabB = session.result.current.tabs.find((tab) => tab.document.path === paths[1])!
    const originA = originFor(session, tabA.id)
    vi.useFakeTimers()
    act(() => session.result.current.updateMarkdown(originA, 'A1'))
    act(() => session.result.current.requestCloseTab(tabA.id))
    act(() => session.result.current.discardAndCloseTab())
    act(() => session.result.current.updateMarkdown(originA, 'stale A'))
    await act(async () => {
      await expect(session.result.current.pasteImage({ bytes: [137, 80], mimeType: 'image/png' }, originA)).resolves.toBeNull()
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    vi.useRealTimers()

    expect(disk.get(paths[0])).toBe('A0')
    expect(disk.get(paths[1])).toBe('B0')
    expect(mocks.writeImageAsset).not.toHaveBeenCalled()
    expect(session.result.current.tabs.find((tab) => tab.id === tabB.id)?.document.markdown).toBe('B0')
  })

  it('keeps two real Markdown files isolated through interleaved delayed updates and autosaves', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'milo-origin-interleaved-'))
    const paths = [join(directory, 'A.md'), join(directory, 'B.md')]
    writeFileSync(paths[0], 'A0', 'utf8')
    writeFileSync(paths[1], 'B0', 'utf8')
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({ path: requestedPath, markdown: readFileSync(requestedPath, 'utf8'), lineEnding: 'lf' as const, hasBom: false }))
    mocks.writeMarkdownFile.mockImplementation(async (document) => {
      writeFileSync(document.path, document.markdown, 'utf8')
      return { ...document }
    })
    const session = renderHook(() => useDocumentSession())
    try {
      await act(async () => {
        await session.result.current.openDocumentAtPath(paths[0])
        await session.result.current.openDocumentAtPath(paths[1])
      })
      const tabA = session.result.current.tabs.find((tab) => tab.document.path === paths[0])!
      const tabB = session.result.current.tabs.find((tab) => tab.document.path === paths[1])!
      const originA = originFor(session, tabA.id)
      const originB = originFor(session, tabB.id)

      vi.useFakeTimers()
      act(() => session.result.current.updateMarkdown(originA, 'A1'))
      act(() => session.result.current.updateMarkdown(originB, 'B1'))
      act(() => session.result.current.updateMarkdown(originA, 'A2'))
      act(() => session.result.current.updateMarkdown(originB, 'B2'))
      await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

      expect(readFileSync(paths[0], 'utf8')).toBe('A2')
      expect(readFileSync(paths[1], 'utf8')).toBe('B2')
    } finally {
      vi.useRealTimers()
      rmSync(directory, { recursive: true, force: true })
    }
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
      await expect(unsaved.result.current.pasteImage({ bytes: [137, 80], mimeType: 'image/png' }, originFor(unsaved, unsaved.result.current.activeTabId))).resolves.toBeNull()
    })
    expect(mocks.writeImageAsset).not.toHaveBeenCalled()
    unsaved.unmount()

    const session = await openSavedDocument()
    await act(async () => {
      await expect(session.result.current.pasteImage({ bytes: [137, 80], mimeType: 'image/png' }, originFor(session, session.result.current.activeTabId))).resolves.toBe('assets/image.png')
    })
    expect(mocks.writeImageAsset).toHaveBeenCalledWith(path, { bytes: [137, 80], mimeType: 'image/png' })
  })
})

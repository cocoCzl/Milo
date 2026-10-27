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
    mocks.recoverAndReadMarkdownFile.mockImplementation(async (requestedPath) =>
      mocks.readMarkdownFile(requestedPath),
    )
    mocks.usesMacOSSafeSaveV2.mockReturnValue(false)
    mocks.writeMarkdownFile.mockImplementation(async (document) => {
      fileOnDisk = document.markdown
      return { ...document }
    })
    mocks.writeMarkdownFileSafely.mockImplementation(async (document) => {
      fileOnDisk = document.markdown
      return { ...document }
    })
    mocks.writeImageAsset.mockResolvedValue({
      path: '/tmp/assets/image.png',
      relativePath: 'assets/image.png',
    })
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

  it('coordinates all tabs, flushes delayed edits, rejects repeated requests and cancels safely', async () => {
    const session = renderHook(() => useDocumentSession())
    act(() => session.result.current.createNewDocument())
    const first = session.result.current.activeTabId!
    act(() =>
      session.result.current.registerFlush(first, () => {
        const tab = session.result.current.tabs.find((tab) => tab.id === first)!
        session.result.current.updateMarkdown(
          { tabId: first, documentId: tab.document.id, path: null },
          '刚确认的中文',
        )
        return true
      }),
    )
    act(() => session.result.current.createNewDocument())
    const complete = vi.fn(async () => undefined)
    act(() => {
      expect(session.result.current.requestCloseAll(complete)).toBe(true)
      expect(session.result.current.requestCloseAll(complete)).toBe(false)
    })
    expect(session.result.current.closingTabId).toBe(first)
    expect(session.result.current.document.markdown).toBe('刚确认的中文')
    expect(complete).not.toHaveBeenCalled()
    act(() => session.result.current.cancelCloseTab())
    expect(session.result.current.activeTabId).toBe(first)
    expect(session.result.current.tabs).toHaveLength(2)
    act(() => {
      session.result.current.requestCloseAll(complete)
    })
    act(() => session.result.current.discardAndCloseTab())
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
  })

  it('does not complete native close after a failed write and allows retry', async () => {
    const session = await openSavedDocument()
    act(() => updateActive(session, 'latest'))
    const complete = vi.fn(async () => undefined)
    act(() => {
      session.result.current.requestCloseAll(complete)
    })
    mocks.writeMarkdownFile.mockRejectedValueOnce(new Error('disk full'))
    await act(async () => {
      await session.result.current.saveAndCloseTab()
    })
    expect(complete).not.toHaveBeenCalled()
    expect(session.result.current.document.markdown).toBe('latest')
    expect(session.result.current.saveError).toContain('disk full')
    await act(async () => {
      await session.result.current.saveAndCloseTab()
    })
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(session.result.current.tabs).toHaveLength(1)
  })

  it('flushes the current editor before explicit save without waiting for a listener', async () => {
    const session = await openSavedDocument()
    act(() =>
      session.result.current.registerFlush(session.result.current.activeTabId!, () => {
        updateActive(session, '最后一次修改')
        return true
      }),
    )
    await act(async () => {
      await session.result.current.saveDocument()
    })
    expect(fileOnDisk).toBe('最后一次修改')
  })

  it('keeps a document open when watcher registration is denied', async () => {
    mocks.watchMarkdownFile.mockRejectedValueOnce(new Error('forbidden path: /tmp/milo-note.md'))
    const session = renderHook(() => useDocumentSession())

    await act(async () => {
      await session.result.current.openDocumentAtPath(path)
    })

    await waitFor(() => expect(session.result.current.watchState).toBe('unavailable'))
    expect(session.result.current.document.markdown).toBe('# Before\n')
    expect(session.result.current.document.isDirty).toBe(false)
    expect(session.result.current.error).toBeNull()
    expect(session.result.current.saveError).toBeNull()
    expect(session.result.current.watchError).toContain('forbidden path')
    expect(session.result.current.closingTabId).toBeNull()
  })

  it('keeps a successful disk save successful when watcher setup is unavailable', async () => {
    mocks.watchMarkdownFile.mockRejectedValueOnce(new Error('allow-watch denied'))
    const session = renderHook(() => useDocumentSession())

    await act(async () => {
      await session.result.current.openDocumentAtPath(path)
    })
    await waitFor(() => expect(session.result.current.watchState).toBe('unavailable'))

    act(() => updateActive(session, '# Saved while unwatched'))
    await act(async () => {
      await expect(session.result.current.saveDocument()).resolves.toBe(true)
    })

    expect(session.result.current.document.isDirty).toBe(false)
    expect(session.result.current.saveFeedback).toBe('saved')
    expect(session.result.current.saveError).toBeNull()
    expect(session.result.current.watchState).toBe('unavailable')
  })

  it('closes normally after a watcher denial and a successful save', async () => {
    mocks.watchMarkdownFile.mockRejectedValueOnce(new Error('allow-watch denied'))
    const session = renderHook(() => useDocumentSession())

    await act(async () => {
      await session.result.current.openDocumentAtPath(path)
    })
    await waitFor(() => expect(session.result.current.watchState).toBe('unavailable'))

    act(() => updateActive(session, '# Close after save'))
    await act(async () => {
      await session.result.current.saveDocument()
    })
    act(() => session.result.current.requestCloseTab(session.result.current.activeTabId!))

    expect(session.result.current.tabs).toHaveLength(0)
    expect(session.result.current.closingTabId).toBeNull()
  })

  it('keeps the close guard for a real disk save failure', async () => {
    const session = await openSavedDocument()
    act(() => updateActive(session, '# Keep local'))
    mocks.writeMarkdownFile.mockRejectedValueOnce(new Error('Disk full'))

    await act(async () => {
      await session.result.current.saveDocument()
    })

    expect(session.result.current.saveError).toBe('Disk full')
    act(() => session.result.current.requestCloseTab(session.result.current.activeTabId!))
    expect(session.result.current.closingTabId).toBe(session.result.current.activeTabId)
  })

  it('marks a normally registered watcher active', async () => {
    const session = await openSavedDocument()
    expect(session.result.current.watchState).toBe('active')
    expect(session.result.current.watchError).toBeNull()
  })

  function updateActive(
    session: { result: { current: ReturnType<typeof useDocumentSession> } },
    markdown: string,
  ) {
    const tab = session.result.current.tabs.find(
      (item) => item.id === session.result.current.activeTabId,
    )!
    session.result.current.updateMarkdown(
      { tabId: tab.id, documentId: tab.document.id, path: tab.document.path },
      markdown,
    )
  }

  function originFor(
    session: { result: { current: ReturnType<typeof useDocumentSession> } },
    tabId: number,
  ) {
    const tab = session.result.current.tabs.find((item) => item.id === tabId)!
    return { tabId: tab.id, documentId: tab.document.id, path: tab.document.path }
  }

  it('starts with no document session and returns to that state after closing the last tab', () => {
    const session = renderHook(() => useDocumentSession())

    expect(session.result.current.tabs).toHaveLength(0)
    expect(session.result.current.activeTabId).toBeNull()
    expect(mocks.watchMarkdownFile).not.toHaveBeenCalled()
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()

    act(() => session.result.current.createNewDocument())
    expect(session.result.current.tabs).toHaveLength(1)
    expect(session.result.current.activeTabId).not.toBeNull()

    act(() => session.result.current.requestCloseTab(session.result.current.activeTabId!))
    expect(session.result.current.tabs).toHaveLength(0)
    expect(session.result.current.activeTabId).toBeNull()
  })

  it('auto-saves a changed saved document, but never writes an unsaved document', async () => {
    const unsaved = renderHook(() => useDocumentSession())

    act(() => {
      unsaved.result.current.createNewDocument()
    })
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

    expect(mocks.writeMarkdownFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path,
        markdown: '# After',
      }),
    )
    expect(session.result.current.document.isDirty).toBe(false)
    expect(session.result.current.saveFeedback).toBe('saved')
    vi.useRealTimers()
  })

  it('creates a new macOS document through Safe Save without using the atomic replacement writer', async () => {
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    mocks.pickMarkdownSavePath.mockResolvedValue('/tmp/new.md')
    const session = renderHook(() => useDocumentSession())

    act(() => session.result.current.createNewDocument())
    act(() => updateActive(session, '# New'))
    await act(async () => {
      await session.result.current.saveDocument()
    })

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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

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
    mocks.writeMarkdownFileSafely.mockRejectedValueOnce(
      'Safe Save external change conflict: disk content no longer matches the session version.',
    )
    const session = await openSavedDocument()

    act(() => updateActive(session, '# Local'))
    await act(async () => {
      await session.result.current.saveDocument()
    })

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

  it('pauses a queued autosave when a delayed watcher read finds a dirty conflict, including later retained edits', async () => {
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    const session = await openSavedDocument()
    vi.useFakeTimers()
    act(() => updateActive(session, '# Local before notification'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(mocks.writeMarkdownFileSafely).not.toHaveBeenCalled()

    fileOnDisk = '# External version'
    let finishRead!: (file: {
      path: string
      markdown: string
      lineEnding: 'lf'
      hasBom: boolean
    }) => void
    mocks.recoverAndReadMarkdownFile.mockImplementationOnce(
      () => new Promise((resolve) => (finishRead = resolve)),
    )
    act(() => notifyChange?.())
    act(() => updateActive(session, '# Local while watcher read is pending'))
    await act(async () => {
      finishRead({ path, markdown: fileOnDisk, lineEnding: 'lf', hasBom: false })
    })
    expect(session.result.current.externalChange).toBe('pending')
    expect(session.result.current.document.markdown).toBe('# Local while watcher read is pending')
    expect(session.result.current.document.persistedMarkdown).toBe('# Before\n')
    expect(session.result.current.document.isDirty).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fileOnDisk).toBe('# External version')
    expect(mocks.writeMarkdownFileSafely).not.toHaveBeenCalled()

    act(() => session.result.current.retainLocalChanges())
    expect(session.result.current.externalChange).toBe('retained')
    act(() => updateActive(session, '# Retained and edited again'))
    expect(session.result.current.externalChange).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(session.result.current.externalChange).toBe('pending')
    await act(async () => {
      await expect(session.result.current.saveDocument()).resolves.toBe(false)
    })
    expect(session.result.current.externalChange).toBe('pending')
    expect(session.result.current.document.markdown).toBe('# Retained and edited again')
    expect(session.result.current.document.isDirty).toBe(true)
    expect(fileOnDisk).toBe('# External version')
    expect(mocks.writeMarkdownFileSafely).not.toHaveBeenCalled()
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()

    await act(async () => {
      await session.result.current.reloadExternalChange()
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(session.result.current.document.markdown).toBe('# External version')
    expect(session.result.current.document.persistedMarkdown).toBe('# External version')
    expect(session.result.current.document.isDirty).toBe(false)
    expect(session.result.current.externalChange).toBeNull()
    expect(fileOnDisk).toBe('# External version')
    expect(mocks.writeMarkdownFileSafely).not.toHaveBeenCalled()
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
  })

  it('detects an external version in a delayed autosave preflight before any watcher notification', async () => {
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    const session = await openSavedDocument()
    vi.useFakeTimers()
    let finishRead!: (file: {
      path: string
      markdown: string
      lineEnding: 'lf'
      hasBom: boolean
    }) => void
    mocks.recoverAndReadMarkdownFile.mockImplementationOnce(
      () => new Promise((resolve) => (finishRead = resolve)),
    )
    act(() => updateActive(session, '# Local autosave snapshot'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999)
    })
    expect(mocks.recoverAndReadMarkdownFile).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(mocks.recoverAndReadMarkdownFile).toHaveBeenCalledTimes(2)
    fileOnDisk = '# External during preflight'
    act(() => updateActive(session, '# New local edit during preflight'))
    await act(async () => {
      finishRead({ path, markdown: fileOnDisk, lineEnding: 'lf', hasBom: false })
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(session.result.current.externalChange).toBe('pending')
    expect(session.result.current.document.markdown).toBe('# New local edit during preflight')
    expect(session.result.current.document.isDirty).toBe(true)
    expect(fileOnDisk).toBe('# External during preflight')
    expect(mocks.writeMarkdownFileSafely).not.toHaveBeenCalled()
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
  })

  it('writes only after explicit conflict overwrite and leaves edits during that write dirty', async () => {
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    const session = await openSavedDocument()
    vi.useFakeTimers()
    act(() => updateActive(session, '# Local choice'))
    fileOnDisk = '# External choice'
    await act(async () => notifyChange?.())
    expect(session.result.current.externalChange).toBe('pending')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(mocks.writeMarkdownFileSafely).not.toHaveBeenCalled()

    let finishWrite!: () => void
    mocks.writeMarkdownFileSafely.mockImplementationOnce(
      (document) =>
        new Promise((resolve) => {
          finishWrite = () => {
            fileOnDisk = document.markdown
            resolve({ ...document })
          }
        }),
    )
    let overwrite!: Promise<boolean>
    await act(async () => {
      overwrite = session.result.current.overwriteExternalChange()
    })
    expect(mocks.writeMarkdownFileSafely).toHaveBeenCalledWith(
      { path, markdown: '# Local choice', lineEnding: 'lf', hasBom: false },
      { path, markdown: '# External choice', lineEnding: 'lf', hasBom: false },
    )
    expect(fileOnDisk).toBe('# External choice')
    act(() => updateActive(session, '# New edit during explicit write'))
    await act(async () => {
      finishWrite()
      await expect(overwrite).resolves.toBe(true)
    })
    expect(fileOnDisk).toBe('# Local choice')
    expect(session.result.current.document.markdown).toBe('# New edit during explicit write')
    expect(session.result.current.document.persistedMarkdown).toBe('# Local choice')
    expect(session.result.current.document.isDirty).toBe(true)
    expect(session.result.current.externalChange).toBeNull()
  })

  it('keeps both conflict versions on Save As cancellation and saves a chosen copy without changing the external file', async () => {
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    const session = await openSavedDocument()
    vi.useFakeTimers()
    act(() => updateActive(session, '# Local copy'))
    fileOnDisk = '# External original'
    await act(async () => notifyChange?.())
    expect(session.result.current.externalChange).toBe('pending')
    mocks.pickMarkdownSavePath.mockResolvedValueOnce(null)
    await act(async () => {
      await expect(session.result.current.saveAsDocument()).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(session.result.current.document.path).toBe(path)
    expect(session.result.current.document.markdown).toBe('# Local copy')
    expect(session.result.current.document.isDirty).toBe(true)
    expect(session.result.current.externalChange).toBe('pending')
    expect(fileOnDisk).toBe('# External original')
    expect(mocks.writeMarkdownFileSafely).not.toHaveBeenCalled()

    const copyPath = '/tmp/milo-conflict-copy.md'
    let copyOnDisk: string | null = null
    mocks.pickMarkdownSavePath.mockResolvedValueOnce(copyPath)
    mocks.writeMarkdownFileSafely.mockImplementationOnce(async (document) => {
      expect(document.path).toBe(copyPath)
      copyOnDisk = document.markdown
      return { ...document }
    })
    await act(async () => {
      await expect(session.result.current.saveAsDocument()).resolves.toBe(true)
    })
    expect(mocks.writeMarkdownFileSafely).toHaveBeenCalledWith(
      { path: copyPath, markdown: '# Local copy', lineEnding: 'lf', hasBom: false },
      null,
    )
    expect(copyOnDisk).toBe('# Local copy')
    expect(fileOnDisk).toBe('# External original')
    expect(session.result.current.document.path).toBe(copyPath)
    expect(session.result.current.document.isDirty).toBe(false)
    expect(session.result.current.externalChange).toBeNull()
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
  })

  it.each(['pending', 'retained'] as const)(
    'saves a %s conflict to a new path, then watches and autosaves only that path',
    async (conflict) => {
      mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
      const files = new Map([[path, '# Before\n']])
      const callbacks = new Map<string, () => void>()
      const stops = new Map<string, ReturnType<typeof vi.fn>>()
      mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
        path: requestedPath,
        markdown: files.get(requestedPath)!,
        lineEnding: 'lf' as const,
        hasBom: false,
      }))
      mocks.watchMarkdownFile.mockImplementation(async (watchedPath, callback) => {
        callbacks.set(watchedPath, callback)
        notifyChange = callback
        const stop = vi.fn(async () => undefined)
        stops.set(watchedPath, stop)
        return stop
      })
      mocks.writeMarkdownFileSafely.mockImplementation(async (document, expected) => {
        if (expected) expect(files.get(document.path)).toBe(expected.markdown)
        else expect(files.has(document.path)).toBe(false)
        files.set(document.path, document.markdown)
        return { ...document }
      })
      const session = await openSavedDocument()
      vi.useFakeTimers()
      act(() => updateActive(session, '# Local copy'))
      files.set(path, '# External original')
      await act(async () => callbacks.get(path)?.())
      if (conflict === 'retained') act(() => session.result.current.retainLocalChanges())
      expect(session.result.current.externalChange).toBe(conflict)
      const oldCallback = callbacks.get(path)!
      const oldStop = stops.get(path)!
      const copyPath = '/tmp/new-conflict-copy.md'
      mocks.pickMarkdownSavePath.mockResolvedValueOnce(copyPath)
      await act(async () => {
        await expect(session.result.current.saveAsDocument()).resolves.toBe(true)
      })
      expect(files.get(path)).toBe('# External original')
      expect(files.get(copyPath)).toBe('# Local copy')
      expect(session.result.current.document.path).toBe(copyPath)
      expect(session.result.current.document.persistedMarkdown).toBe('# Local copy')
      expect(session.result.current.externalChange).toBeNull()
      expect(oldStop).toHaveBeenCalledTimes(1)
      expect(callbacks.has(copyPath)).toBe(true)
      const reads = mocks.recoverAndReadMarkdownFile.mock.calls.length
      await act(async () => oldCallback())
      expect(mocks.recoverAndReadMarkdownFile).toHaveBeenCalledTimes(reads)
      expect(session.result.current.document.markdown).toBe('# Local copy')
      act(() => updateActive(session, '# Copy autosave'))
      await act(async () => vi.advanceTimersByTimeAsync(1000))
      expect(files.get(copyPath)).toBe('# Copy autosave')
      expect(files.get(path)).toBe('# External original')
      expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
    },
  )

  it.each(['pending', 'retained'] as const)(
    'keeps a %s conflict and its snapshot when a new-path save fails',
    async (conflict) => {
      mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
      const session = await openSavedDocument()
      act(() => updateActive(session, '# Local failed copy'))
      fileOnDisk = '# External original'
      await act(async () => notifyChange?.())
      if (conflict === 'retained') act(() => session.result.current.retainLocalChanges())
      const snapshot = { ...session.result.current.document }
      mocks.pickMarkdownSavePath.mockResolvedValueOnce('/tmp/failed-copy.md')
      mocks.writeMarkdownFileSafely.mockRejectedValueOnce(new Error('Disk full'))
      await act(async () => {
        await expect(session.result.current.saveAsDocument()).resolves.toBe(false)
      })
      expect(session.result.current.document).toEqual(snapshot)
      expect(session.result.current.externalChange).toBe(conflict)
      expect(session.result.current.saveError).toBe('Disk full')
      expect(session.result.current.saveFeedback).not.toBe('saved')
      expect(fileOnDisk).toBe('# External original')
    },
  )

  it('keeps the original-path conflict check and propagates new-target protection failures', async () => {
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    const session = await openSavedDocument()
    act(() => updateActive(session, '# Local'))
    fileOnDisk = '# External'
    await act(async () => notifyChange?.())
    mocks.pickMarkdownSavePath.mockResolvedValueOnce(path)
    await act(async () => {
      await expect(session.result.current.saveAsDocument()).resolves.toBe(false)
    })
    expect(mocks.writeMarkdownFileSafely).not.toHaveBeenCalled()
    for (const reason of [
      'Safe Save external change conflict: destination already exists',
      'Safe Save target identity changed while opening for commit.',
    ]) {
      mocks.pickMarkdownSavePath.mockResolvedValueOnce('/tmp/occupied-copy.md')
      mocks.writeMarkdownFileSafely.mockRejectedValueOnce(new Error(reason))
      const snapshot = { ...session.result.current.document }
      await act(async () => {
        await expect(session.result.current.saveAsDocument()).resolves.toBe(false)
      })
      expect(mocks.writeMarkdownFileSafely).toHaveBeenLastCalledWith(
        { path: '/tmp/occupied-copy.md', markdown: '# Local', lineEnding: 'lf', hasBom: false },
        null,
      )
      expect(session.result.current.document).toEqual(snapshot)
      expect(session.result.current.externalChange).toBe('pending')
      expect(fileOnDisk).toBe('# External')
    }
  })

  it('keeps a new-path save snapshot isolated while editing and switching tabs during its write', async () => {
    mocks.usesMacOSSafeSaveV2.mockReturnValue(true)
    const session = await openSavedDocument()
    const sourceId = session.result.current.activeTabId!
    act(() => updateActive(session, '# Copy snapshot'))
    fileOnDisk = '# External source'
    await act(async () => notifyChange?.())
    const copyPath = '/tmp/delayed-copy.md'
    mocks.pickMarkdownSavePath.mockResolvedValueOnce(copyPath)
    let finishWrite!: () => void
    mocks.writeMarkdownFileSafely.mockImplementationOnce((document, expected) => {
      expect(expected).toBeNull()
      return new Promise((resolve) => {
        finishWrite = () => resolve({ ...document })
      })
    })
    let save!: Promise<boolean>
    await act(async () => {
      save = session.result.current.saveAsDocument()
    })
    const origin = originFor(session, sourceId)
    act(() => session.result.current.updateMarkdown(origin, '# New edit during copy'))
    act(() => session.result.current.createNewDocument())
    const otherId = session.result.current.activeTabId
    await act(async () => {
      finishWrite()
      await expect(save).resolves.toBe(true)
    })
    const source = session.result.current.tabs.find((tab) => tab.id === sourceId)!
    expect(source.document.path).toBe(copyPath)
    expect(source.document.markdown).toBe('# New edit during copy')
    expect(source.document.persistedMarkdown).toBe('# Copy snapshot')
    expect(source.document.isDirty).toBe(true)
    expect(source.document.revision).toBeGreaterThan(0)
    expect(session.result.current.activeTabId).toBe(otherId)
    expect(session.result.current.document.path).toBeNull()
    expect(fileOnDisk).toBe('# External source')
  })

  it.each([0, 500])(
    'blocks autosave and manual save when composition starts after %sms',
    async (delay) => {
      const session = await openSavedDocument()
      vi.useFakeTimers()
      const origin = originFor(session, session.result.current.activeTabId!)
      if (delay) act(() => updateActive(session, '# Confirmed pending edit'))
      await act(async () => vi.advanceTimersByTimeAsync(delay))
      act(() => session.result.current.updateComposition(origin, { phase: 'composing' }))
      act(() => session.result.current.updateMarkdown(origin, '# Confirmed pending edit ni hao'))
      mocks.pickMarkdownSavePath.mockResolvedValueOnce(null)
      let pendingSave!: Promise<boolean>
      let pendingSaveAs!: Promise<boolean>
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
        pendingSave = session.result.current.saveDocument()
        pendingSaveAs = session.result.current.saveAsDocument()
      })
      expect(fileOnDisk).toBe('# Before\n')
      expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
      expect(mocks.pickMarkdownSavePath).not.toHaveBeenCalled()
      act(() => session.result.current.requestCloseTab(origin.tabId))
      await act(async () => session.result.current.saveAndCloseTab())
      expect(session.result.current.closingTabId).toBe(origin.tabId)
      expect(session.result.current.tabs).toHaveLength(1)
      act(() =>
        session.result.current.updateComposition(origin, {
          phase: 'settled',
          markdown: '# Confirmed pending edit 你好',
        }),
      )
      await act(async () => {
        await expect(pendingSave).resolves.toBe(true)
        await expect(pendingSaveAs).resolves.toBe(false)
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(fileOnDisk).toBe('# Confirmed pending edit 你好')
      expect(session.result.current.document.isDirty).toBe(false)
    },
  )

  it('saves confirmed edits after cancellation and does not block another tab', async () => {
    const files = new Map([
      [path, '# Before\n'],
      ['/tmp/other.md', '# Other\n'],
    ])
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
      path: requestedPath,
      markdown: files.get(requestedPath)!,
      lineEnding: 'lf' as const,
      hasBom: false,
    }))
    mocks.writeMarkdownFile.mockImplementation(async (document) => {
      files.set(document.path, document.markdown)
      return { ...document }
    })
    const session = await openSavedDocument()
    const source = originFor(session, session.result.current.activeTabId!)
    await act(async () => session.result.current.openDocumentAtPath('/tmp/other.md'))
    const other = originFor(session, session.result.current.activeTabId!)
    vi.useFakeTimers()
    act(() => session.result.current.updateMarkdown(source, '# Confirmed edit'))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    act(() => session.result.current.updateComposition(source, { phase: 'composing' }))
    act(() => session.result.current.updateMarkdown(source, '# Confirmed edit ni hao'))
    act(() => session.result.current.updateMarkdown(other, '# Other saved independently'))
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(files.get(path)).toBe('# Before\n')
    expect(files.get('/tmp/other.md')).toBe('# Other saved independently')
    act(() =>
      session.result.current.updateComposition(source, {
        phase: 'settled',
        markdown: '# Confirmed edit',
      }),
    )
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(files.get(path)).toBe('# Confirmed edit')
    act(() => session.result.current.updateMarkdown(source, '# After cancellation'))
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(files.get(path)).toBe('# After cancellation')
    expect(
      session.result.current.tabs.find((tab) => tab.id === source.tabId)?.document.isDirty,
    ).toBe(false)
  })

  it('rechecks composition after an asynchronous save preflight', async () => {
    const session = await openSavedDocument()
    const origin = originFor(session, session.result.current.activeTabId!)
    act(() => updateActive(session, '# Confirmed snapshot'))
    let finishRead!: () => void
    mocks.recoverAndReadMarkdownFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = () =>
            resolve({ path, markdown: '# Before\n', lineEnding: 'lf', hasBom: false })
        }),
    )
    let save!: Promise<boolean>
    await act(async () => {
      save = session.result.current.saveDocument()
    })
    act(() => session.result.current.updateComposition(origin, { phase: 'composing' }))
    act(() => updateActive(session, '# Confirmed snapshot ni hao'))
    await act(async () => {
      finishRead()
      await expect(save).resolves.toBe(false)
    })
    expect(fileOnDisk).toBe('# Before\n')
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled()
  })

  it('finishes an already-started confirmed write without marking an active composition saved or closing it', async () => {
    const session = await openSavedDocument()
    const origin = originFor(session, session.result.current.activeTabId!)
    act(() => updateActive(session, '# Confirmed snapshot'))
    act(() => session.result.current.requestCloseTab(origin.tabId))
    let finishWrite!: () => void
    mocks.writeMarkdownFile.mockImplementationOnce(
      (document) =>
        new Promise((resolve) => {
          finishWrite = () => {
            fileOnDisk = document.markdown
            resolve({ ...document })
          }
        }),
    )
    let close!: Promise<void>
    await act(async () => {
      close = session.result.current.saveAndCloseTab()
    })
    expect(mocks.writeMarkdownFile).toHaveBeenCalledTimes(1)
    act(() => session.result.current.updateComposition(origin, { phase: 'composing' }))
    // Even before the 200ms listener forwards new text, the active composition
    // must keep the tab dirty and prevent a close on the older write completion.
    await act(async () => {
      finishWrite()
      await close
    })
    expect(fileOnDisk).toBe('# Confirmed snapshot')
    expect(session.result.current.tabs).toHaveLength(1)
    expect(session.result.current.document.isDirty).toBe(true)
    expect(session.result.current.saveFeedback).not.toBe('saved')
    expect(session.result.current.closingTabId).toBe(origin.tabId)
    act(() => updateActive(session, '# Confirmed snapshot ni hao'))
    act(() =>
      session.result.current.updateComposition(origin, {
        phase: 'settled',
        markdown: '# Confirmed snapshot 你好',
      }),
    )
    expect(session.result.current.document.isDirty).toBe(true)
    await act(async () => session.result.current.saveAndCloseTab())
    expect(fileOnDisk).toBe('# Confirmed snapshot 你好')
    expect(session.result.current.tabs).toHaveLength(0)
  })

  it('returns to clean after cancelling a composition back to an already-written snapshot', async () => {
    const session = await openSavedDocument()
    const origin = originFor(session, session.result.current.activeTabId!)
    act(() => updateActive(session, '# Confirmed snapshot'))
    await act(async () => session.result.current.saveDocument())
    act(() => session.result.current.updateComposition(origin, { phase: 'composing' }))
    act(() => updateActive(session, '# Confirmed snapshot ni hao'))
    act(() =>
      session.result.current.updateComposition(origin, {
        phase: 'settled',
        markdown: '# Confirmed snapshot',
      }),
    )
    expect(session.result.current.document.isDirty).toBe(false)
    expect(fileOnDisk).toBe('# Confirmed snapshot')
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
      session.result.current.requestCloseTab(session.result.current.activeTabId!)
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
    mocks.pickMarkdownFile.mockResolvedValueOnce(paths[0]).mockResolvedValueOnce(paths[1])
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
    expect(session.result.current.tabs).toHaveLength(2)

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

    expect(
      session.result.current.tabs.find((tab) => tab.id === firstTab.id)?.document.markdown,
    ).toBe('# First local')
    expect(
      session.result.current.tabs.find((tab) => tab.id === secondTab.id)?.document.markdown,
    ).toBe('# Second local')

    act(() => {
      session.result.current.requestCloseTab(firstTab.id)
    })
    expect(session.result.current.closingTabId).toBe(firstTab.id)
    act(() => {
      session.result.current.discardAndCloseTab()
    })

    expect(session.result.current.tabs.find((tab) => tab.id === firstTab.id)).toBeUndefined()
    expect(
      session.result.current.tabs.find((tab) => tab.id === secondTab.id)?.document.markdown,
    ).toBe('# Second local')
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

    expect(session.result.current.tabs.find((tab) => tab.id === tabA.id)?.document.markdown).toBe(
      'A1',
    )
    expect(session.result.current.tabs.find((tab) => tab.id === tabB.id)?.document.markdown).toBe(
      'B0',
    )
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

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100)
      })

      expect(readFileSync(paths[0], 'utf8')).toBe('A1')
      expect(readFileSync(paths[1], 'utf8')).toBe('B0\n')
      expect(session.result.current.tabs.find((tab) => tab.id === tabB.id)?.document.markdown).toBe(
        'B0\n',
      )
    } finally {
      vi.useRealTimers()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('ignores stale callbacks and cancels pending autosave after their origin tab closes', async () => {
    const paths = ['/tmp/closed-a.md', '/tmp/closed-b.md']
    const disk = new Map([
      [paths[0], 'A0'],
      [paths[1], 'B0'],
    ])
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
      path: requestedPath,
      markdown: disk.get(requestedPath)!,
      lineEnding: 'lf' as const,
      hasBom: false,
    }))
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
      await expect(
        session.result.current.pasteImage({ bytes: [137, 80], mimeType: 'image/png' }, originA),
      ).resolves.toBeNull()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    vi.useRealTimers()

    expect(disk.get(paths[0])).toBe('A0')
    expect(disk.get(paths[1])).toBe('B0')
    expect(mocks.writeImageAsset).not.toHaveBeenCalled()
    expect(session.result.current.tabs.find((tab) => tab.id === tabB.id)?.document.markdown).toBe(
      'B0',
    )
  })

  it('keeps two real Markdown files isolated through interleaved delayed updates and autosaves', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'milo-origin-interleaved-'))
    const paths = [join(directory, 'A.md'), join(directory, 'B.md')]
    writeFileSync(paths[0], 'A0', 'utf8')
    writeFileSync(paths[1], 'B0', 'utf8')
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
      const originA = originFor(session, tabA.id)
      const originB = originFor(session, tabB.id)

      vi.useFakeTimers()
      act(() => session.result.current.updateMarkdown(originA, 'A1'))
      act(() => session.result.current.updateMarkdown(originB, 'B1'))
      act(() => session.result.current.updateMarkdown(originA, 'A2'))
      act(() => session.result.current.updateMarkdown(originB, 'B2'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100)
      })

      expect(readFileSync(paths[0], 'utf8')).toBe('A2')
      expect(readFileSync(paths[1], 'utf8')).toBe('B2')
    } finally {
      vi.useRealTimers()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('opens a tree file once, then activates its existing tab', async () => {
    const session = renderHook(() => useDocumentSession())

    act(() => session.result.current.createNewDocument())

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

  it('opens a saved file into an empty workspace without creating an untitled tab', async () => {
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
      path: requestedPath,
      markdown: '# Readme',
      lineEnding: 'lf' as const,
      hasBom: false,
    }))
    const session = renderHook(() => useDocumentSession())

    await act(async () => {
      await session.result.current.openDocumentAtPath('/tmp/README.md')
    })

    expect(session.result.current.tabs).toHaveLength(1)
    expect(session.result.current.document.path).toBe('/tmp/README.md')
    expect(session.result.current.document.title).toBe('README.md')
    expect(session.result.current.tabs.some((tab) => tab.document.path === null)).toBe(false)
  })

  it('restores saved files and safely skips unavailable session paths', async () => {
    const availablePath = '/tmp/restored.md'
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => {
      if (requestedPath !== availablePath) throw new Error('Not found')
      return {
        path: availablePath,
        markdown: '# Restored',
        lineEnding: 'lf' as const,
        hasBom: false,
      }
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

  it('restores a launch file with the saved tabs in one session and makes it active', async () => {
    mocks.readMarkdownFile.mockImplementation(async (requestedPath) => ({
      path: requestedPath,
      markdown: requestedPath.endsWith('launch.md') ? '# Launch' : '# Restored',
      lineEnding: 'lf' as const,
      hasBom: false,
    }))
    const session = renderHook(() => useDocumentSession())

    await act(async () => {
      await session.result.current.restoreStartupSession(
        {
          activeDocumentPath: '/tmp/restored.md',
          openDocumentPaths: ['/tmp/restored.md'],
        },
        '/tmp/launch.md',
      )
    })

    expect(session.result.current.tabs.map((tab) => tab.document.path)).toEqual([
      '/tmp/restored.md',
      '/tmp/launch.md',
    ])
    expect(session.result.current.document.path).toBe('/tmp/launch.md')
    expect(session.result.current.document.markdown).toBe('# Launch')
  })

  it('keeps an empty workspace empty for an empty startup session', async () => {
    const session = renderHook(() => useDocumentSession())

    await act(async () => {
      await session.result.current.restoreStartupSession({
        activeDocumentPath: null,
        openDocumentPaths: [],
      })
    })

    expect(session.result.current.tabs).toHaveLength(0)
    expect(session.result.current.activeTabId).toBeNull()
    expect(session.result.current.document.path).toBeNull()
  })

  it('writes a pasted image only after a document has a saved path', async () => {
    const unsaved = renderHook(() => useDocumentSession())
    mocks.pickMarkdownSavePath.mockResolvedValue(null)

    act(() => unsaved.result.current.createNewDocument())

    await act(async () => {
      await expect(
        unsaved.result.current.pasteImage(
          { bytes: [137, 80], mimeType: 'image/png' },
          originFor(unsaved, unsaved.result.current.activeTabId!),
        ),
      ).resolves.toBeNull()
    })
    expect(mocks.writeImageAsset).not.toHaveBeenCalled()
    unsaved.unmount()

    const session = await openSavedDocument()
    await act(async () => {
      await expect(
        session.result.current.pasteImage(
          { bytes: [137, 80], mimeType: 'image/png' },
          originFor(session, session.result.current.activeTabId!),
        ),
      ).resolves.toBe('assets/image.png')
    })
    expect(mocks.writeImageAsset).toHaveBeenCalledWith(path, {
      bytes: [137, 80],
      mimeType: 'image/png',
    })
  })
})

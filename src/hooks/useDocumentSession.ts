import {
  startOpenProfile,
  profileAsync,
  profileMeasure,
  stageOpenProfile,
} from '../diagnostics/openProfile'
import { queueDraft, readDrafts, flushDrafts } from '../file-system/draftRecovery'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { composeMarkdownDocument, inspectMarkdownDocument } from '../editor/markdown/documentSafety'
import { watchMarkdownFile } from '../file-system/nativeFileWatcher'
import type { StartupSession } from '../settings/applicationSettings'
import {
  createDocumentState,
  createTab,
  emptyDocumentTab,
  titleFromPath,
  type DocumentSession,
  type DocumentTab,
  type DocumentOrigin,
} from './documentSessionModel'
import { readableError } from '../lib/readableError'
import type { EditorComposition } from '../editor/milkdown/compositionSaveBoundary'
import {
  pickMarkdownFile,
  pickMarkdownSavePath,
  recoverAndReadMarkdownFile,
  type PastedImage,
  usesMacOSSafeSaveV2,
  writeImageAsset,
  writeMarkdownFile,
  writeMarkdownFileSafely,
} from '../file-system/nativeMarkdownFile'

let documentId = 0

function createUntitledDocument(): DocumentSession {
  documentId += 1
  return { ...createDocumentState(documentId), recoveryId: crypto.randomUUID() }
}

export function useDocumentSession(untitledTitle = 'Untitled') {
  const [openError, setOpenError] = useState<string | null>(null)
  const [tabs, setTabs] = useState<DocumentTab[]>([])
  const [activeTabId, setActiveTabId] = useState<number | null>(null)
  const [closePending, setClosePending] = useState(false)
  const [closingTabId, setClosingTabId] = useState<number | null>(null)
  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)
  const selfWritesRef = useRef(new Map<number, { path: string; markdown: string }>())
  const watchReadsRef = useRef(new Map<number, object>())
  const stableWaitersRef = useRef(new Map<number, Set<(stable: boolean) => void>>())
  const flushersRef = useRef(new Map<number, () => boolean>())
  const savingRef = useRef(new Map<number, Promise<boolean>>())
  const savePickersRef = useRef(new Map<number, Promise<boolean>>())
  const removingRef = useRef(new Map<number, Promise<boolean>>())
  const closeAllRef = useRef<{ complete: () => Promise<void>; failed?: () => void } | null>(null)
  const closingRef = useRef<number | null>(null)
  const saveRef = useRef<() => Promise<boolean>>(async () => false)
  const untitledTitleRef = useRef(untitledTitle)

  tabsRef.current = tabs
  activeTabIdRef.current = activeTabId
  untitledTitleRef.current = untitledTitle

  const registerFlush = useCallback((id: number, flush: (() => boolean) | null) => {
    if (flush) flushersRef.current.set(id, flush)
    else flushersRef.current.delete(id)
  }, [])

  const replaceTab = useCallback((id: number, update: (tab: DocumentTab) => DocumentTab) => {
    const nextTabs = tabsRef.current.map((tab) => (tab.id === id ? update(tab) : tab))
    tabsRef.current = nextTabs
    setTabs(nextTabs)
  }, [])

  const getTab = useCallback(
    (id: number | null) => tabsRef.current.find((tab) => tab.id === id) ?? null,
    [],
  )

  const originForTab = useCallback(
    (tab: DocumentTab): DocumentOrigin => ({
      tabId: tab.id,
      documentId: tab.document.id,
      path: tab.document.path,
    }),
    [],
  )

  const getOriginTab = useCallback(
    (origin: DocumentOrigin) => {
      const tab = getTab(origin.tabId)
      if (!tab || tab.document.id !== origin.documentId) return null
      return tab
    },
    [getTab],
  )

  const waitUntilStable = useCallback(
    (id: number): Promise<boolean> => {
      const tab = getTab(id)
      if (!tab) return Promise.resolve(false)
      const flushed = flushersRef.current.get(id)?.()
      if (!getTab(id)?.isComposing && flushed !== false) return Promise.resolve(true)
      return new Promise((resolve) => {
        const waiters = stableWaitersRef.current.get(id) ?? new Set()
        waiters.add(resolve)
        stableWaitersRef.current.set(id, waiters)
      })
    },
    [getTab],
  )
  useEffect(() => {
    const waiters = stableWaitersRef.current
    return () => {
      for (const group of waiters.values()) for (const resolve of group) resolve(false)
      waiters.clear()
    }
  }, [])

  const selectTab = useCallback(
    (id: number) => {
      if (getTab(id)) {
        activeTabIdRef.current = id
        setActiveTabId(id)
      }
    },
    [getTab],
  )

  const appendTab = useCallback((document: DocumentSession) => {
    const nextTab = createTab(document)
    const nextTabs = [...tabsRef.current, nextTab]
    tabsRef.current = nextTabs
    setTabs(nextTabs)
    activeTabIdRef.current = nextTab.id
    setActiveTabId(nextTab.id)
    return nextTab
  }, [])

  const updateMarkdown = useCallback(
    (origin: DocumentOrigin, markdown: string) => {
      const tab = getOriginTab(origin)
      const ignored =
        !tab || Boolean(tab.document.protectionReason) || tab.document.markdown === markdown
      if (ignored) return

      replaceTab(origin.tabId, (current) => {
        const isDirty =
          current.document.persistedMarkdown === null
            ? markdown.length > 0
            : composeMarkdownDocument(current.document.frontMatter, markdown) !==
              current.document.persistedMarkdown
        return {
          ...current,
          document: {
            ...current.document,
            markdown,
            isDirty,
            revision: current.document.revision + 1,
          },
          externalChange: null,
          notice: null,
          saveFeedback: current.document.path && isDirty ? 'pending' : 'idle',
        }
      })
    },
    [getOriginTab, replaceTab],
  )

  const createNewDocument = useCallback(() => {
    appendTab(createUntitledDocument())
  }, [appendTab])

  const updateComposition = useCallback(
    (origin: DocumentOrigin, state: EditorComposition) => {
      if (!getOriginTab(origin)) return
      if (state.phase === 'settled') updateMarkdown(origin, state.markdown)
      replaceTab(origin.tabId, (tab) => ({
        ...tab,
        isComposing: state.phase === 'composing',
        document:
          state.phase === 'settled' && tab.document.persistedMarkdown !== null
            ? {
                ...tab.document,
                isDirty:
                  composeMarkdownDocument(tab.document.frontMatter, tab.document.markdown) !==
                  tab.document.persistedMarkdown,
              }
            : tab.document,
      }))
      if (state.phase === 'settled') {
        const waiters = stableWaitersRef.current.get(origin.tabId)
        stableWaitersRef.current.delete(origin.tabId)
        waiters?.forEach((resolve) => resolve(true))
      }
    },
    [getOriginTab, replaceTab, updateMarkdown],
  )

  const openDocumentAtPath = useCallback(
    async (path: string) => {
      setOpenError(null)
      const existingTab = tabsRef.current.find((tab) => tab.document.path === path)
      if (existingTab) {
        activeTabIdRef.current = existingTab.id
        setActiveTabId(existingTab.id)
        return true
      }

      try {
        const profile = startOpenProfile(path, 'running-open')
        const file = await profileAsync(profile, 'recovery+read+IPC', () =>
          recoverAndReadMarkdownFile(path),
        )
        const duplicateTab = tabsRef.current.find((tab) => tab.document.path === file.path)
        if (duplicateTab) {
          activeTabIdRef.current = duplicateTab.id
          setActiveTabId(duplicateTab.id)
          return true
        }

        const inspected = profileMeasure(profile, 'safety-parse', () =>
          inspectMarkdownDocument(file.markdown),
        )
        stageOpenProfile(file.path, profile, file.markdown)
        documentId += 1
        appendTab({
          id: documentId,
          path: file.path,
          title: titleFromPath(file.path),
          markdown: inspected.body,
          lineEnding: file.lineEnding,
          hasBom: file.hasBom,
          frontMatter: inspected.frontMatter,
          isDirty: false,
          protectionReason: inspected.protectionReason,
          persistedMarkdown: file.markdown,
          editorVersion: 0,
          revision: 0,
        })
        return true
      } catch (reason) {
        setOpenError(`${path}: ${readableError(reason, 'Could not open this Markdown file.')}`)
        return false
      }
    },
    [appendTab],
  )

  const openDocument = useCallback(async () => {
    const path = await pickMarkdownFile()
    if (path) await openDocumentAtPath(path)
  }, [openDocumentAtPath])

  const restoreStartupSession = useCallback(
    async (startupSession: StartupSession, launchPath: string | null = null) => {
      const uniquePaths = [
        ...new Set([...startupSession.openDocumentPaths, ...(launchPath ? [launchPath] : [])]),
      ]
      const activePath = launchPath ?? startupSession.activeDocumentPath ?? uniquePaths[0]
      const placeholders = uniquePaths
        .filter((path) => !tabsRef.current.some((tab) => tab.document.path === path))
        .map((path) => {
          documentId++
          return {
            ...createTab({ ...createDocumentState(documentId), path, title: titleFromPath(path) }),
            activity: 'opening' as const,
          }
        })
      const hadUserTabs = tabsRef.current.length > 0
      tabsRef.current = [...tabsRef.current, ...placeholders]
      setTabs(tabsRef.current)
      if (!hadUserTabs) {
        const active =
          placeholders.find((tab) => tab.document.path === activePath) ?? placeholders[0]
        if (active) {
          activeTabIdRef.current = active.id
          setActiveTabId(active.id)
        }
      }
      const load = async (placeholder: DocumentTab) => {
        const path = placeholder.document.path!
        try {
          const profile = startOpenProfile(
            path,
            path === activePath ? 'restore-active' : 'restore-background',
          )
          const file = await profileAsync(profile, 'recovery+read+IPC', () =>
            recoverAndReadMarkdownFile(path),
          )
          // Closed placeholders stay closed, and another open operation wins.
          const current = getTab(placeholder.id)
          if (!current || current.activity !== 'opening') return
          const inspected = profileMeasure(profile, 'safety-parse', () =>
            inspectMarkdownDocument(file.markdown),
          )
          stageOpenProfile(file.path, profile, file.markdown)
          replaceTab(placeholder.id, (tab) => ({
            ...tab,
            activity: 'idle',
            document: {
              ...tab.document,
              path: file.path,
              title: titleFromPath(file.path),
              markdown: inspected.body,
              lineEnding: file.lineEnding,
              hasBom: file.hasBom,
              frontMatter: inspected.frontMatter,
              persistedMarkdown: file.markdown,
              protectionReason: inspected.protectionReason,
            },
          }))
        } catch (reason) {
          const current = getTab(placeholder.id)
          if (!current) return
          if (path === launchPath) {
            replaceTab(placeholder.id, (tab) => ({
              ...tab,
              activity: 'idle',
              error: readableError(reason, 'Could not open this Markdown file.'),
              document: { ...tab.document, path: null },
            }))
          } else {
            const remaining = tabsRef.current.filter((tab) => tab.id !== placeholder.id)
            tabsRef.current = remaining
            setTabs(remaining)
            if (activeTabIdRef.current === placeholder.id) {
              const next = remaining[0]?.id ?? null
              activeTabIdRef.current = next
              setActiveTabId(next)
            }
          }
        }
      }
      const prioritized = [...placeholders].sort(
        (a, b) => Number(b.document.path === activePath) - Number(a.document.path === activePath),
      )
      // Publish the activity-priority document before reading background files.
      if (prioritized[0]) await load(prioritized.shift()!)
      const worker = async () => {
        while (prioritized.length) {
          const next = prioritized.shift()!
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
          if (getTab(next.id)) await load(next)
        }
      }
      await Promise.all([worker(), worker()])
      return tabsRef.current.length > 0
    },
    [getTab, replaceTab],
  )

  const clearRecoveryCopy = useCallback(
    async (origin: DocumentOrigin, recoveryId: string) => {
      try {
        await queueDraft(recoveryId, null)
        if (getOriginTab(origin))
          replaceTab(origin.tabId, (tab) => ({
            ...tab,
            error: null,
            document: { ...tab.document, recoveryId: undefined },
          }))
        return true
      } catch (reason) {
        if (getOriginTab(origin))
          replaceTab(origin.tabId, (tab) => ({
            ...tab,
            error: readableError(reason, 'Could not clear recovery copy.'),
          }))
        return false
      }
    },
    [getOriginTab, replaceTab],
  )

  const performSaveToPath = useCallback(
    async (
      origin: DocumentOrigin,
      path: string,
      allowExternalOverwrite = false,
      expectedRevision?: number,
    ): Promise<boolean> => {
      if (flushersRef.current.get(origin.tabId)?.() === false) return false
      const savedTab = getOriginTab(origin)
      if (
        !savedTab ||
        savedTab.isComposing ||
        savedTab.document.protectionReason ||
        (expectedRevision !== undefined &&
          (savedTab.document.revision !== expectedRevision ||
            savedTab.document.path !== path ||
            origin.path !== path))
      )
        return false
      const savedSnapshot = savedTab.document
      // A normal Save queued behind Save As must not switch back to its old
      // destination. Explicit Save As destinations remain intentional.
      if (origin.path === path && savedSnapshot.path !== path) return false
      if (
        savedSnapshot.path === path &&
        !savedSnapshot.isDirty &&
        !savedTab.saveError &&
        !allowExternalOverwrite &&
        savedSnapshot.persistedMarkdown ===
          composeMarkdownDocument(savedSnapshot.frontMatter, savedSnapshot.markdown)
      )
        return (
          !savedTab.externalChange &&
          (!savedSnapshot.recoveryId || (await clearRecoveryCopy(origin, savedSnapshot.recoveryId)))
        )
      const safeSaveEnabled = usesMacOSSafeSaveV2()
      let expectedDisk =
        savedSnapshot.path !== path || savedSnapshot.persistedMarkdown === null
          ? null
          : {
              path,
              markdown: savedSnapshot.persistedMarkdown,
              lineEnding: savedSnapshot.lineEnding,
              hasBom: savedSnapshot.hasBom,
            }

      if (
        !allowExternalOverwrite &&
        savedSnapshot.path === path &&
        (savedTab.externalChange || savedSnapshot.persistedMarkdown !== null)
      ) {
        if (savedSnapshot.path === path && savedSnapshot.persistedMarkdown !== null) {
          try {
            const onDisk = await recoverAndReadMarkdownFile(path)
            if (onDisk.markdown !== savedSnapshot.persistedMarkdown) {
              if (getOriginTab(origin))
                replaceTab(origin.tabId, (tab) => ({
                  ...tab,
                  externalChange: 'pending',
                  notice: null,
                }))
              return false
            }
          } catch {
            if (getOriginTab(origin))
              replaceTab(origin.tabId, (tab) => ({
                ...tab,
                externalChange: 'pending',
                notice: null,
              }))
            return false
          }
        } else {
          return false
        }
      }

      if (!getOriginTab(origin) || getOriginTab(origin)?.isComposing) return false
      if (safeSaveEnabled && allowExternalOverwrite) {
        try {
          expectedDisk = await recoverAndReadMarkdownFile(path)
        } catch {
          if (getOriginTab(origin))
            replaceTab(origin.tabId, (tab) => ({ ...tab, externalChange: 'pending', notice: null }))
          return false
        }
      }
      if (!getOriginTab(origin) || getOriginTab(origin)?.isComposing) return false
      replaceTab(origin.tabId, (tab) => ({
        ...tab,
        activity: 'saving',
        error: null,
        saveError: null,
        saveFeedback: 'saving',
      }))
      const serializedMarkdown = composeMarkdownDocument(
        savedSnapshot.frontMatter,
        savedSnapshot.markdown,
      )

      try {
        const savedFile = safeSaveEnabled
          ? await writeMarkdownFileSafely(
              {
                path,
                markdown: serializedMarkdown,
                lineEnding: savedSnapshot.lineEnding,
                hasBom: savedSnapshot.hasBom,
              },
              expectedDisk,
            )
          : await writeMarkdownFile({
              path,
              markdown: serializedMarkdown,
              lineEnding: savedSnapshot.lineEnding,
              hasBom: savedSnapshot.hasBom,
            })
        // The editor may be ahead of the debounced session publication.
        // Publish it before deciding whether this older disk snapshot is clean.
        flushersRef.current.get(origin.tabId)?.()
        const latestTab = getOriginTab(origin)
        if (!latestTab) {
          return false
        }
        selfWritesRef.current.set(origin.tabId, {
          path: savedFile.path,
          markdown: serializedMarkdown,
        })
        replaceTab(origin.tabId, (tab) => ({
          ...tab,
          activity: 'idle',
          document: {
            ...tab.document,
            path: savedFile.path,
            title: titleFromPath(savedFile.path),
            lineEnding: savedFile.lineEnding,
            hasBom: savedFile.hasBom,
            isDirty: tab.isComposing || tab.document.markdown !== savedSnapshot.markdown,
            persistedMarkdown: serializedMarkdown,
          },
          externalChange: null,
          notice: null,
          saveFeedback:
            tab.isComposing || tab.document.markdown !== savedSnapshot.markdown
              ? 'pending'
              : 'saved',
          saveError: null,
        }))
        return (
          !savedSnapshot.recoveryId || (await clearRecoveryCopy(origin, savedSnapshot.recoveryId))
        )
      } catch (reason) {
        const externalConflict =
          safeSaveEnabled && String(reason).includes('Safe Save external change conflict')
        if (getOriginTab(origin))
          replaceTab(origin.tabId, (tab) => ({
            ...tab,
            activity: 'idle',
            saveError: externalConflict
              ? null
              : readableError(reason, 'Could not save this Markdown file.'),
            error: externalConflict
              ? null
              : readableError(reason, 'Could not save this Markdown file.'),
            externalChange: externalConflict ? 'pending' : tab.externalChange,
            saveFeedback: 'idle',
          }))
        return false
      }
    },
    [clearRecoveryCopy, getOriginTab, replaceTab],
  )

  // Serialize writes for each document, including preflight disk reads. A
  // concurrent manual save waits and then snapshots the latest stable content.
  const saveToPath = useCallback(
    async (...args: Parameters<typeof performSaveToPath>) => {
      const id = args[0].tabId
      const previous = savingRef.current.get(id)
      const operation = previous
        ? previous.then(() => performSaveToPath(...args))
        : performSaveToPath(...args)
      savingRef.current.set(id, operation)
      try {
        return await operation
      } finally {
        if (savingRef.current.get(id) === operation) savingRef.current.delete(id)
      }
    },
    [performSaveToPath],
  )

  const saveAsDocument = useCallback(
    (id = activeTabIdRef.current): Promise<boolean> => {
      if (id === null) return Promise.resolve(false)
      const pending = savePickersRef.current.get(id)
      if (pending) return pending
      const operation = (async () => {
        if (!(await waitUntilStable(id))) return false
        const tab = getTab(id)
        if (!tab || tab.isComposing || tab.document.protectionReason) return false
        const defaultPath = tab.document.path ?? `${untitledTitleRef.current}.md`
        const path = await pickMarkdownSavePath(defaultPath)
        return path && (await waitUntilStable(id)) ? saveToPath(originForTab(tab), path) : false
      })().finally(() => {
        if (savePickersRef.current.get(id) === operation) savePickersRef.current.delete(id)
      })
      savePickersRef.current.set(id, operation)
      return operation
    },
    [getTab, originForTab, saveToPath, waitUntilStable],
  )

  const saveDocument = useCallback(
    async (id = activeTabIdRef.current) => {
      if (id === null || !(await waitUntilStable(id))) return false
      const tab = getTab(id)
      if (!tab || tab.document.protectionReason) return false
      return tab.document.path
        ? saveToPath(originForTab(tab), tab.document.path)
        : saveAsDocument(id)
    },
    [getTab, originForTab, saveAsDocument, saveToPath, waitUntilStable],
  )

  const pasteImage = useCallback(
    async (image: PastedImage, origin: DocumentOrigin): Promise<string | null> => {
      let tab = getOriginTab(origin)
      if (!tab || tab.document.protectionReason) return null
      if (!tab.document.path && !(await saveDocument(origin.tabId))) return null
      tab = getOriginTab(origin)
      if (!tab?.document.path) return null

      try {
        const asset = await writeImageAsset(tab.document.path, image)
        return asset.relativePath
      } catch (reason) {
        if (getOriginTab(origin))
          replaceTab(origin.tabId, (current) => ({
            ...current,
            error: readableError(reason, 'Could not paste this image asset.'),
          }))
        return null
      }
    },
    [getOriginTab, replaceTab, saveDocument],
  )

  saveRef.current = saveDocument

  const reloadExternalChange = useCallback(
    async (id = activeTabIdRef.current) => {
      const currentTab = getTab(id)
      if (!currentTab?.document.path) return
      const tabId = currentTab.id
      replaceTab(tabId, (tab) => ({ ...tab, activity: 'opening' }))
      try {
        const file = await recoverAndReadMarkdownFile(currentTab.document.path)
        const inspected = inspectMarkdownDocument(file.markdown)
        selfWritesRef.current.delete(tabId)
        replaceTab(tabId, (tab) => ({
          ...tab,
          activity: 'idle',
          isComposing: false,
          document: {
            ...tab.document,
            path: file.path,
            title: titleFromPath(file.path),
            markdown: inspected.body,
            lineEnding: file.lineEnding,
            hasBom: file.hasBom,
            frontMatter: inspected.frontMatter,
            isDirty: false,
            protectionReason: inspected.protectionReason,
            persistedMarkdown: file.markdown,
            editorVersion: tab.document.editorVersion + 1,
            revision: tab.document.revision + 1,
          },
          externalChange: null,
          notice: 'Reloaded external change.',
          saveFeedback: 'idle',
        }))
      } catch (reason) {
        replaceTab(tabId, (tab) => ({
          ...tab,
          activity: 'idle',
          error: readableError(reason, 'Could not reload the externally changed file.'),
        }))
      }
    },
    [getTab, replaceTab],
  )

  const retainLocalChanges = useCallback(
    (id = activeTabIdRef.current) => {
      if (id === null) return
      replaceTab(id, (tab) => ({ ...tab, externalChange: 'retained', notice: null }))
    },
    [replaceTab],
  )

  const overwriteExternalChange = useCallback(
    async (id = activeTabIdRef.current) => {
      const tab = getTab(id)
      return tab?.document.path ? saveToPath(originForTab(tab), tab.document.path, true) : false
    },
    [getTab, originForTab, saveToPath],
  )

  const handleWatchedChange = useCallback(
    async (id: number, path: string) => {
      const currentTab = getTab(id)
      if (!currentTab || currentTab.document.path !== path) return
      const read = {}
      watchReadsRef.current.set(id, read)
      try {
        const file = await recoverAndReadMarkdownFile(path)
        if (watchReadsRef.current.get(id) !== read) return
        flushersRef.current.get(id)?.()
        const latestTab = getTab(id)
        if (!latestTab || latestTab.document.path !== file.path) return
        const selfWrite = selfWritesRef.current.get(id)
        if (selfWrite?.path === file.path && selfWrite.markdown === file.markdown) {
          selfWritesRef.current.delete(id)
          return
        }
        if (file.markdown === latestTab.document.persistedMarkdown) return
        if (latestTab.document.isDirty || latestTab.isComposing) {
          replaceTab(id, (tab) => ({ ...tab, externalChange: 'pending', notice: null }))
          return
        }
        const inspected = inspectMarkdownDocument(file.markdown)
        replaceTab(id, (tab) => ({
          ...tab,
          document: {
            ...tab.document,
            markdown: inspected.body,
            lineEnding: file.lineEnding,
            hasBom: file.hasBom,
            frontMatter: inspected.frontMatter,
            isDirty: false,
            protectionReason: inspected.protectionReason,
            persistedMarkdown: file.markdown,
            editorVersion: tab.document.editorVersion + 1,
            revision: tab.document.revision + 1,
          },
          externalChange: null,
          notice: 'Reloaded external change.',
          saveFeedback: 'idle',
        }))
      } catch (reason) {
        if (watchReadsRef.current.get(id) !== read || getTab(id)?.document.path !== path) return
        replaceTab(id, (tab) => ({
          ...tab,
          watchError: readableError(reason, 'Could not read an external file change.'),
        }))
      }
    },
    [getTab, replaceTab],
  )

  const watchSignature = tabs
    .map((tab) => `${tab.id}:${tab.document.path ?? ''}:${tab.activity === 'opening'}`)
    .join('|')
  const autoSaveSignature = tabs
    .map((tab) =>
      [
        tab.id,
        tab.document.path,
        tab.document.isDirty,
        tab.document.revision,
        tab.document.protectionReason,
        tab.activity,
        tab.isComposing,
        tab.externalChange,
        tab.saveError,
      ].join(':'),
    )
    .join('|')
  const savedFeedbackSignature = tabs.map((tab) => `${tab.id}:${tab.saveFeedback}`).join('|')

  const watchersRef = useRef(
    new Map<number, { path: string; stopped: boolean; stop?: () => Promise<void> }>(),
  )
  useEffect(() => {
    const watchers = watchersRef.current
    for (const [id, watcher] of watchers) {
      if (getTab(id)?.document.path === watcher.path) continue
      watcher.stopped = true
      void watcher.stop?.()
      watchers.delete(id)
    }
    for (const tab of tabsRef.current) {
      const path = tab.document.path
      if (!path || tab.activity === 'opening' || watchers.has(tab.id)) continue
      const watcher: { path: string; stopped: boolean; stop?: () => Promise<void> } = {
        path,
        stopped: false,
      }
      watchers.set(tab.id, watcher)
      void watchMarkdownFile(path, () => {
        if (!watcher.stopped) void handleWatchedChange(tab.id, path)
      })
        .then((stop) => {
          if (watcher.stopped) {
            void stop()
            return
          }
          watcher.stop = stop
          replaceTab(tab.id, (current) => ({ ...current, watchError: null, watchState: 'active' }))
        })
        .catch((reason) => {
          if (!watcher.stopped)
            replaceTab(tab.id, (current) => ({
              ...current,
              watchError: readableError(
                reason,
                'Could not watch this Markdown file for external changes.',
              ),
              watchState: 'unavailable',
            }))
        })
    }
  }, [getTab, handleWatchedChange, replaceTab, watchSignature])
  useEffect(() => {
    const watchers = watchersRef.current
    return () => {
      for (const watcher of watchers.values()) {
        watcher.stopped = true
        void watcher.stop?.()
      }
      watchers.clear()
    }
  }, [])

  useEffect(() => {
    const timers = tabsRef.current.flatMap((tab) => {
      const path = tab.document.path
      if (
        !path ||
        !tab.document.isDirty ||
        tab.document.protectionReason ||
        tab.activity !== 'idle' ||
        tab.isComposing ||
        tab.externalChange ||
        tab.saveError
      )
        return []
      const origin = originForTab(tab)
      const revision = tab.document.revision
      const timer = window.setTimeout(() => {
        void saveToPath(origin, path, false, revision)
      }, 1000)
      return [{ timer }]
    })
    return () => timers.forEach(({ timer }) => window.clearTimeout(timer))
  }, [autoSaveSignature, originForTab, saveToPath])

  useEffect(() => {
    const timers = tabsRef.current.flatMap((tab) =>
      tab.saveFeedback === 'saved'
        ? [
            window.setTimeout(
              () => replaceTab(tab.id, (current) => ({ ...current, saveFeedback: 'idle' })),
              1800,
            ),
          ]
        : [],
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [replaceTab, savedFeedbackSignature])

  const removeTab = useCallback((id: number) => {
    const currentTabs = tabsRef.current
    const index = currentTabs.findIndex((tab) => tab.id === id)
    if (index < 0) return
    stableWaitersRef.current.get(id)?.forEach((resolve) => resolve(false))
    stableWaitersRef.current.delete(id)
    selfWritesRef.current.delete(id)
    watchReadsRef.current.delete(id)
    flushersRef.current.delete(id)
    const nextTabs = currentTabs.filter((tab) => tab.id !== id)
    if (nextTabs.length === 0) {
      tabsRef.current = []
      activeTabIdRef.current = null
      setTabs([])
      setActiveTabId(null)
    } else {
      tabsRef.current = nextTabs
      setTabs(nextTabs)
      if (activeTabIdRef.current === id) {
        const nextActiveTabId = nextTabs[Math.min(index, nextTabs.length - 1)].id
        activeTabIdRef.current = nextActiveTabId
        setActiveTabId(nextActiveTabId)
      }
    }
    setClosingTabId(null)
  }, [])

  const removeProtectedTab = useCallback(
    (id: number): Promise<boolean> => {
      const pending = removingRef.current.get(id)
      if (pending) return pending
      const tab = getTab(id)
      if (!tab) return Promise.resolve(true)
      const { recoveryId, revision, isDirty } = tab.document
      // A new untouched UUID has never had a snapshot. All other recovery
      // identities must be cleared successfully before forgetting the document.
      if (!recoveryId || (!revision && !isDirty)) {
        removeTab(id)
        return Promise.resolve(true)
      }
      replaceTab(id, (current) => ({ ...current, activity: 'saving' }))
      const operation = queueDraft(recoveryId, null)
        .then(() => {
          removeTab(id)
          return true
        })
        .catch((reason) => {
          replaceTab(id, (current) => ({
            ...current,
            activity: 'idle',
            error: readableError(
              reason,
              'Could not clear recovery copy. The document remains open.',
            ),
          }))
          return false
        })
        .finally(() => removingRef.current.delete(id))
      removingRef.current.set(id, operation)
      return operation
    },
    [getTab, removeTab, replaceTab],
  )

  const needsCloseConfirmation = (tab: DocumentTab) =>
    tab.document.isDirty ||
    tab.isComposing ||
    Boolean(tab.saveError) ||
    Boolean(tab.error && tab.document.recoveryId) ||
    tab.activity === 'saving' ||
    savingRef.current.has(tab.id)

  const continueCloseAll = useCallback(() => {
    if (!closeAllRef.current) return
    for (const tab of tabsRef.current) flushersRef.current.get(tab.id)?.()
    const pending = tabsRef.current.find(needsCloseConfirmation)
    if (pending) {
      closingRef.current = pending.id
      selectTab(pending.id)
      setClosingTabId(pending.id)
    } else {
      const { complete, failed } = closeAllRef.current
      // Keep the coordinator locked while native completion/settings flush.
      void flushDrafts()
        .then(complete)
        .then(() => {
          closeAllRef.current = null
          setClosePending(false)
        })
        .catch((reason) => {
          failed?.()
          closeAllRef.current = null
          setClosePending(false)
          const first = tabsRef.current[0]
          if (first)
            replaceTab(first.id, (tab) => ({
              ...tab,
              error: readableError(reason, 'Could not close safely.'),
            }))
        })
    }
  }, [replaceTab, selectTab])

  const requestCloseAll = useCallback(
    (complete: () => Promise<void>, failed?: () => void) => {
      if (closeAllRef.current || closingRef.current !== null) return false
      closeAllRef.current = { complete, failed }
      setClosePending(true)
      continueCloseAll()
      return true
    },
    [continueCloseAll],
  )

  const requestCloseTab = useCallback(
    (id: number) => {
      if (closingRef.current !== null || closeAllRef.current) return
      flushersRef.current.get(id)?.()
      const tab = getTab(id)
      if (!tab) return
      if (needsCloseConfirmation(tab)) {
        closingRef.current = id
        selectTab(id)
        setClosingTabId(id)
      } else void removeProtectedTab(id)
    },
    [getTab, removeProtectedTab, selectTab],
  )

  const finishCloseTab = useCallback(
    async (id: number, discard: boolean) => {
      if ((!closeAllRef.current || discard) && !(await removeProtectedTab(id))) return
      closingRef.current = null
      setClosingTabId(null)
      continueCloseAll()
    },
    [continueCloseAll, removeProtectedTab],
  )

  const discardAndCloseTab = useCallback(() => {
    const id = closingRef.current
    // Never race an in-flight write with a discard or removal.
    if (id !== null && !savingRef.current.has(id)) return finishCloseTab(id, true)
  }, [finishCloseTab])

  const cancelCloseTab = useCallback(() => {
    const id = closingRef.current
    if (id !== null && removingRef.current.has(id)) return
    if (id !== null) selectTab(id)
    closeAllRef.current = null
    setClosePending(false)
    closingRef.current = null
    setClosingTabId(null)
    window.setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(`#document-panel-${id} .ProseMirror`)
          ?.focus({ preventScroll: true }),
      0,
    )
  }, [selectTab])

  const saveAndCloseTab = useCallback(async () => {
    const id = closingRef.current
    if (id === null || getTab(id)?.isComposing) return
    const pending = savingRef.current.get(id)
    if (pending) await pending
    if (closingRef.current !== id || !(await saveDocument(id))) return
    const tab = getTab(id)
    if (closingRef.current === id && tab && !tab.isComposing && !tab.document.isDirty)
      await finishCloseTab(id, false)
  }, [finishCloseTab, getTab, saveDocument])

  const recoverDrafts = useCallback(async () => {
    const { drafts, errors } = await readDrafts()
    for (const draft of drafts) {
      if (tabsRef.current.some((tab) => tab.document.recoveryId === draft.id)) continue
      appendTab({
        ...createUntitledDocument(),
        markdown: draft.markdown,
        isDirty: true,
        recoveryId: draft.id,
      })
    }
    if (errors.length) throw new Error(errors.join('\n'))
  }, [appendTab])

  const draftSignature = tabs
    .map((tab) => `${tab.id}:${tab.document.revision}:${tab.document.path}:${tab.isComposing}`)
    .join('|')
  useEffect(() => {
    const timers = tabsRef.current.flatMap((tab) => {
      const doc = tab.document
      if (doc.path || !doc.recoveryId || !doc.isDirty || tab.isComposing) return []
      return [
        window.setTimeout(() => {
          const current = getTab(tab.id)
          if (
            !current ||
            removingRef.current.has(tab.id) ||
            current.document.path ||
            current.isComposing ||
            !current.document.isDirty ||
            current.document.recoveryId !== doc.recoveryId ||
            current.document.revision !== doc.revision
          )
            return
          void queueDraft(doc.recoveryId!, doc.markdown).catch((reason) =>
            replaceTab(tab.id, (current) => ({
              ...current,
              error: readableError(reason, 'Could not protect unsaved document.'),
            })),
          )
        }, 600),
      ]
    })
    return () => timers.forEach(window.clearTimeout)
  }, [draftSignature, getTab, replaceTab])

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? emptyDocumentTab,
    [activeTabId, tabs],
  )

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 's')
        return
      event.preventDefault()
      if (event.shiftKey) void saveAsDocument()
      else void saveRef.current()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [saveAsDocument])

  return {
    ...activeTab,
    activeTabId,
    cancelCloseTab,
    closingTabId,
    closePending,
    discardPending: closingTabId !== null && removingRef.current.has(closingTabId),
    createNewDocument,
    discardAndCloseTab,
    openError,
    openDocument,
    openDocumentAtPath,
    overwriteExternalChange,
    pasteImage,
    reloadExternalChange,
    restoreStartupSession,
    requestCloseTab,
    requestCloseAll,
    registerFlush,
    recoverDrafts,
    retainLocalChanges,
    retrySave: saveDocument,
    saveAndCloseTab,
    saveAsDocument,
    saveDocument,
    selectTab,
    tabs,
    updateMarkdown,
    updateComposition,
  }
}

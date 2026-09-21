import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { composeMarkdownDocument, inspectMarkdownDocument } from '../editor/markdown/documentSafety'
import { watchMarkdownFile } from '../file-system/nativeFileWatcher'
import type { StartupSession } from '../settings/applicationSettings'
import {
  type LineEnding,
  pickMarkdownFile,
  pickMarkdownSavePath,
  recoverAndReadMarkdownFile,
  type PastedImage,
  usesMacOSSafeSaveV2,
  writeImageAsset,
  writeMarkdownFile,
  writeMarkdownFileSafely,
} from '../file-system/nativeMarkdownFile'

type DocumentActivity = 'idle' | 'opening' | 'saving'
type SaveFeedback = 'idle' | 'pending' | 'saving' | 'saved'
type ExternalChange = 'pending' | 'retained'

const emptyDocumentTab: DocumentTab = {
  id: 0,
  document: {
    id: 0, path: null, title: '', markdown: '', lineEnding: 'lf', hasBom: false,
    frontMatter: '', isDirty: false, protectionReason: null, persistedMarkdown: null, editorVersion: 0, revision: 0,
  },
  activity: 'idle', error: null, externalChange: null, notice: null, saveFeedback: 'idle',
}

export type DocumentSession = {
  id: number
  path: string | null
  title: string
  markdown: string
  lineEnding: LineEnding
  hasBom: boolean
  frontMatter: string
  isDirty: boolean
  protectionReason: string | null
  persistedMarkdown: string | null
  editorVersion: number
  revision: number
}

export type DocumentTab = {
  id: number
  document: DocumentSession
  activity: DocumentActivity
  error: string | null
  externalChange: ExternalChange | null
  notice: string | null
  saveFeedback: SaveFeedback
}

// This identity is created at the event source and travels with every
// asynchronous operation.  Nothing that originates in an editor may select
// its destination from the currently visible tab later.
export type DocumentOrigin = {
  tabId: number
  documentId: number
  path: string | null
}

let documentId = 0

function createUntitledDocument(): DocumentSession {
  documentId += 1
  return {
    id: documentId, path: null, title: 'Untitled', markdown: '', lineEnding: 'lf', hasBom: false,
    frontMatter: '', isDirty: false, protectionReason: null, persistedMarkdown: null, editorVersion: 0, revision: 0,
  }
}

function createTab(document: DocumentSession): DocumentTab {
  return { id: document.id, document, activity: 'idle', error: null, externalChange: null, notice: null, saveFeedback: 'idle' }
}

function titleFromPath(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

export function useDocumentSession(untitledTitle = 'Untitled') {
  const [tabs, setTabs] = useState<DocumentTab[]>(() => [createTab(createUntitledDocument())])
  const [activeTabId, setActiveTabId] = useState(() => documentId)
  const [closingTabId, setClosingTabId] = useState<number | null>(null)
  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)
  const selfWritesRef = useRef(new Map<number, { path: string; markdown: string }>())
  const saveRef = useRef<() => Promise<boolean>>(async () => false)
  const untitledTitleRef = useRef(untitledTitle)

  tabsRef.current = tabs
  activeTabIdRef.current = activeTabId
  untitledTitleRef.current = untitledTitle

  const replaceTab = useCallback((id: number, update: (tab: DocumentTab) => DocumentTab) => {
    const nextTabs = tabsRef.current.map((tab) => (tab.id === id ? update(tab) : tab))
    tabsRef.current = nextTabs
    setTabs(nextTabs)
  }, [])

  const getTab = useCallback((id: number) => (
    tabsRef.current.find((tab) => tab.id === id) ?? null
  ), [])

  const originForTab = useCallback((tab: DocumentTab): DocumentOrigin => ({
    tabId: tab.id,
    documentId: tab.document.id,
    path: tab.document.path,
  }), [])

  const getOriginTab = useCallback((origin: DocumentOrigin) => {
    const tab = getTab(origin.tabId)
    if (!tab || tab.document.id !== origin.documentId) return null
    return tab
  }, [getTab])

  const selectTab = useCallback((id: number) => {
    if (getTab(id)) setActiveTabId(id)
  }, [getTab])

  const appendTab = useCallback((document: DocumentSession) => {
    const nextTab = createTab(document)
    const nextTabs = [...tabsRef.current, nextTab]
    tabsRef.current = nextTabs
    setTabs(nextTabs)
    setActiveTabId(nextTab.id)
    return nextTab
  }, [])

  const updateMarkdown = useCallback((origin: DocumentOrigin, markdown: string) => {
    const tab = getOriginTab(origin)
    const ignored = !tab || Boolean(tab.document.protectionReason) || tab.document.markdown === markdown
    if (ignored) return

    replaceTab(origin.tabId, (current) => ({
      ...current,
      document: { ...current.document, markdown, isDirty: true, revision: current.document.revision + 1 },
      externalChange: null,
      notice: null,
      saveFeedback: current.document.path ? 'pending' : 'idle',
    }))
  }, [getOriginTab, replaceTab])

  const createNewDocument = useCallback(() => {
    appendTab(createUntitledDocument())
  }, [appendTab])

  const openDocumentAtPath = useCallback(async (path: string) => {
    const existingTab = tabsRef.current.find((tab) => tab.document.path === path)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return true
    }

    try {
      const file = await recoverAndReadMarkdownFile(path)
      const duplicateTab = tabsRef.current.find((tab) => tab.document.path === file.path)
      if (duplicateTab) {
        setActiveTabId(duplicateTab.id)
        return true
      }

      const inspected = inspectMarkdownDocument(file.markdown)
      documentId += 1
      appendTab({
        id: documentId, path: file.path, title: titleFromPath(file.path), markdown: inspected.body,
        lineEnding: file.lineEnding, hasBom: file.hasBom, frontMatter: inspected.frontMatter,
        isDirty: false, protectionReason: inspected.protectionReason, persistedMarkdown: file.markdown, editorVersion: 0, revision: 0,
      })
      return true
    } catch (reason) {
      const failedDocument = createUntitledDocument()
      appendTab(failedDocument)
      replaceTab(failedDocument.id, (tab) => ({
        ...tab,
        error: readableError(reason, 'Could not open this Markdown file.'),
      }))
      return false
    }
  }, [appendTab, replaceTab])

  const openDocument = useCallback(async () => {
    const path = await pickMarkdownFile()
    if (path) await openDocumentAtPath(path)
  }, [openDocumentAtPath])

  const restoreStartupSession = useCallback(async (startupSession: StartupSession) => {
    const uniquePaths = [...new Set(startupSession.openDocumentPaths)]
    const restoredDocuments: Array<DocumentSession | null> = await Promise.all(uniquePaths.map(async (path) => {
      try {
        const file = await recoverAndReadMarkdownFile(path)
        const inspected = inspectMarkdownDocument(file.markdown)
        documentId += 1
        return {
          id: documentId, path: file.path, title: titleFromPath(file.path), markdown: inspected.body,
          lineEnding: file.lineEnding, hasBom: file.hasBom, frontMatter: inspected.frontMatter,
          isDirty: false, protectionReason: inspected.protectionReason, persistedMarkdown: file.markdown, editorVersion: 0, revision: 0,
        }
      } catch {
        return null
      }
    }))
    const tabsToRestore = restoredDocuments.filter((document): document is DocumentSession => document !== null).map(createTab)

    if (tabsToRestore.length === 0) return false

    const activeTab = tabsToRestore.find((tab) => tab.document.path === startupSession.activeDocumentPath) ?? tabsToRestore[0]
    tabsRef.current = tabsToRestore
    activeTabIdRef.current = activeTab.id
    setTabs(tabsToRestore)
    setActiveTabId(activeTab.id)
    return true
  }, [])

  const saveToPath = useCallback(async (
    origin: DocumentOrigin,
    path: string,
    allowExternalOverwrite = false,
    expectedRevision?: number,
  ): Promise<boolean> => {
    const savedTab = getOriginTab(origin)
    if (
      !savedTab
      || savedTab.document.protectionReason
      || (expectedRevision !== undefined && (
        savedTab.document.revision !== expectedRevision
        || savedTab.document.path !== path
        || origin.path !== path
      ))
    ) return false
    const savedSnapshot = savedTab.document
    const safeSaveEnabled = usesMacOSSafeSaveV2()
    let expectedDisk = savedSnapshot.path !== path || savedSnapshot.persistedMarkdown === null ? null : {
      path,
      markdown: savedSnapshot.persistedMarkdown,
      lineEnding: savedSnapshot.lineEnding,
      hasBom: savedSnapshot.hasBom,
    }

    if (!allowExternalOverwrite && (savedTab.externalChange || (savedSnapshot.path === path && savedSnapshot.persistedMarkdown !== null))) {
      if (savedSnapshot.path === path && savedSnapshot.persistedMarkdown !== null) {
        try {
          const onDisk = await recoverAndReadMarkdownFile(path)
          if (onDisk.markdown !== savedSnapshot.persistedMarkdown) {
            if (getOriginTab(origin)) replaceTab(origin.tabId, (tab) => ({ ...tab, externalChange: 'pending', notice: null }))
            return false
          }
        } catch {
          if (getOriginTab(origin)) replaceTab(origin.tabId, (tab) => ({ ...tab, externalChange: 'pending', notice: null }))
          return false
        }
      } else {
        return false
      }
    }

    if (!getOriginTab(origin)) return false
    if (safeSaveEnabled && allowExternalOverwrite) {
      try {
        expectedDisk = await recoverAndReadMarkdownFile(path)
      } catch {
        if (getOriginTab(origin)) replaceTab(origin.tabId, (tab) => ({ ...tab, externalChange: 'pending', notice: null }))
        return false
      }
    }
    replaceTab(origin.tabId, (tab) => ({ ...tab, activity: 'saving', error: null, saveFeedback: 'saving' }))
    const serializedMarkdown = composeMarkdownDocument(savedSnapshot.frontMatter, savedSnapshot.markdown)

    try {
      const savedFile = safeSaveEnabled
        ? await writeMarkdownFileSafely(
          { path, markdown: serializedMarkdown, lineEnding: savedSnapshot.lineEnding, hasBom: savedSnapshot.hasBom },
          expectedDisk,
        )
        : await writeMarkdownFile({ path, markdown: serializedMarkdown, lineEnding: savedSnapshot.lineEnding, hasBom: savedSnapshot.hasBom })
      const latestTab = getOriginTab(origin)
      if (!latestTab) {
        return false
      }
      selfWritesRef.current.set(origin.tabId, { path: savedFile.path, markdown: serializedMarkdown })
      replaceTab(origin.tabId, (tab) => ({
        ...tab,
        activity: 'idle',
        document: {
          ...tab.document, path: savedFile.path, title: titleFromPath(savedFile.path),
          lineEnding: savedFile.lineEnding, hasBom: savedFile.hasBom,
          isDirty: tab.document.markdown !== savedSnapshot.markdown, persistedMarkdown: serializedMarkdown,
        },
        externalChange: null, notice: null, saveFeedback: 'saved',
      }))
      return true
    } catch (reason) {
      const externalConflict = safeSaveEnabled && String(reason).includes('Safe Save external change conflict')
      if (getOriginTab(origin)) replaceTab(origin.tabId, (tab) => ({
        ...tab,
        activity: 'idle',
        error: externalConflict ? null : readableError(reason, 'Could not save this Markdown file.'),
        externalChange: externalConflict ? 'pending' : tab.externalChange,
        saveFeedback: 'idle',
      }))
      return false
    }
  }, [getOriginTab, replaceTab])

  const saveAsDocument = useCallback(async (id = activeTabIdRef.current) => {
    const tab = getTab(id)
    if (!tab || tab.document.protectionReason) return false
    const defaultPath = tab.document.path ?? `${untitledTitleRef.current}.md`
    const path = await pickMarkdownSavePath(defaultPath)
    return path ? saveToPath(originForTab(tab), path) : false
  }, [getTab, originForTab, saveToPath])

  const saveDocument = useCallback(async (id = activeTabIdRef.current) => {
    const tab = getTab(id)
    if (!tab || tab.document.protectionReason) return false
    return tab.document.path ? saveToPath(originForTab(tab), tab.document.path) : saveAsDocument(id)
  }, [getTab, originForTab, saveAsDocument, saveToPath])

  const pasteImage = useCallback(async (image: PastedImage, origin: DocumentOrigin): Promise<string | null> => {
    let tab = getOriginTab(origin)
    if (!tab || tab.document.protectionReason) return null
    if (!tab.document.path && !await saveDocument(origin.tabId)) return null
    tab = getOriginTab(origin)
    if (!tab?.document.path) return null

    try {
      const asset = await writeImageAsset(tab.document.path, image)
      return asset.relativePath
    } catch (reason) {
      if (getOriginTab(origin)) replaceTab(origin.tabId, (current) => ({ ...current, error: readableError(reason, 'Could not paste this image asset.') }))
      return null
    }
  }, [getOriginTab, replaceTab, saveDocument])

  saveRef.current = saveDocument

  const reloadExternalChange = useCallback(async (id = activeTabIdRef.current) => {
    const currentTab = getTab(id)
    if (!currentTab?.document.path) return
    replaceTab(id, (tab) => ({ ...tab, activity: 'opening' }))
    try {
      const file = await recoverAndReadMarkdownFile(currentTab.document.path)
      const inspected = inspectMarkdownDocument(file.markdown)
      selfWritesRef.current.delete(id)
      replaceTab(id, (tab) => ({
        ...tab, activity: 'idle',
        document: {
          ...tab.document, path: file.path, title: titleFromPath(file.path), markdown: inspected.body,
          lineEnding: file.lineEnding, hasBom: file.hasBom, frontMatter: inspected.frontMatter,
          isDirty: false, protectionReason: inspected.protectionReason, persistedMarkdown: file.markdown,
          editorVersion: tab.document.editorVersion + 1, revision: tab.document.revision + 1,
        },
        externalChange: null, notice: 'Reloaded external change.', saveFeedback: 'idle',
      }))
    } catch (reason) {
      replaceTab(id, (tab) => ({ ...tab, activity: 'idle', error: readableError(reason, 'Could not reload the externally changed file.') }))
    }
  }, [getTab, replaceTab])

  const retainLocalChanges = useCallback((id = activeTabIdRef.current) => {
    replaceTab(id, (tab) => ({ ...tab, externalChange: 'retained', notice: null }))
  }, [replaceTab])

  const overwriteExternalChange = useCallback(async (id = activeTabIdRef.current) => {
    const tab = getTab(id)
    return tab?.document.path ? saveToPath(originForTab(tab), tab.document.path, true) : false
  }, [getTab, originForTab, saveToPath])

  const handleWatchedChange = useCallback(async (id: number, path: string) => {
    const currentTab = getTab(id)
    if (!currentTab || currentTab.document.path !== path) return
    try {
      const file = await recoverAndReadMarkdownFile(path)
      const latestTab = getTab(id)
      if (!latestTab || latestTab.document.path !== file.path) return
      const selfWrite = selfWritesRef.current.get(id)
      if (selfWrite?.path === file.path && selfWrite.markdown === file.markdown) {
        selfWritesRef.current.delete(id)
        return
      }
      if (file.markdown === latestTab.document.persistedMarkdown) return
      if (latestTab.document.isDirty) {
        replaceTab(id, (tab) => ({ ...tab, externalChange: 'pending', notice: null }))
        return
      }
      const inspected = inspectMarkdownDocument(file.markdown)
      replaceTab(id, (tab) => ({
        ...tab,
        document: {
          ...tab.document, markdown: inspected.body, lineEnding: file.lineEnding, hasBom: file.hasBom,
          frontMatter: inspected.frontMatter, isDirty: false, protectionReason: inspected.protectionReason,
          persistedMarkdown: file.markdown, editorVersion: tab.document.editorVersion + 1, revision: tab.document.revision + 1,
        },
        externalChange: null, notice: 'Reloaded external change.', saveFeedback: 'idle',
      }))
    } catch (reason) {
      replaceTab(id, (tab) => ({ ...tab, error: readableError(reason, 'Could not read an external file change.') }))
    }
  }, [getTab, replaceTab])

  const watchSignature = tabs.map((tab) => `${tab.id}:${tab.document.path ?? ''}`).join('|')
  const autoSaveSignature = tabs.map((tab) => [tab.id, tab.document.path, tab.document.isDirty, tab.document.revision, tab.document.protectionReason, tab.activity, tab.externalChange].join(':')).join('|')
  const savedFeedbackSignature = tabs.map((tab) => `${tab.id}:${tab.saveFeedback}`).join('|')

  useEffect(() => {
    let stopped = false
    const stopWatching = new Map<number, () => Promise<void>>()
    tabsRef.current.forEach((tab) => {
      if (!tab.document.path) return
      void watchMarkdownFile(tab.document.path, () => {
        if (!stopped) void handleWatchedChange(tab.id, tab.document.path!)
      }).then((stop) => {
        if (stopped) {
          void stop()
        } else stopWatching.set(tab.id, stop)
      }).catch((reason) => {
        if (!stopped) replaceTab(tab.id, (current) => ({ ...current, error: readableError(reason, 'Could not watch this Markdown file for external changes.') }))
      })
    })
    return () => {
      stopped = true
      stopWatching.forEach((stop) => { void stop() })
    }
  }, [handleWatchedChange, replaceTab, watchSignature])

  useEffect(() => {
    const timers = tabsRef.current.flatMap((tab) => {
      if (!tab.document.path || !tab.document.isDirty || tab.document.protectionReason || tab.activity !== 'idle' || tab.externalChange) return []
      const origin = originForTab(tab)
      const revision = tab.document.revision
      const timer = window.setTimeout(() => {
        void saveToPath(origin, origin.path!, false, revision)
      }, 1000)
      return [{ timer }]
    })
    return () => timers.forEach(({ timer }) => window.clearTimeout(timer))
  }, [autoSaveSignature, originForTab, saveToPath])

  useEffect(() => {
    const timers = tabsRef.current.flatMap((tab) => (
      tab.saveFeedback === 'saved'
        ? [window.setTimeout(() => replaceTab(tab.id, (current) => ({ ...current, saveFeedback: 'idle' })), 1800)]
        : []
    ))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [replaceTab, savedFeedbackSignature])

  const removeTab = useCallback((id: number) => {
    const currentTabs = tabsRef.current
    const index = currentTabs.findIndex((tab) => tab.id === id)
    if (index < 0) return
    selfWritesRef.current.delete(id)
    const nextTabs = currentTabs.filter((tab) => tab.id !== id)
    if (nextTabs.length === 0) {
      const replacement = createTab(createUntitledDocument())
      tabsRef.current = [replacement]
      setTabs([replacement])
      setActiveTabId(replacement.id)
    } else {
      tabsRef.current = nextTabs
      setTabs(nextTabs)
      if (activeTabIdRef.current === id) setActiveTabId(nextTabs[Math.min(index, nextTabs.length - 1)].id)
    }
    setClosingTabId(null)
  }, [])

  const requestCloseTab = useCallback((id: number) => {
    const tab = getTab(id)
    if (!tab) return
    if (tab.document.isDirty || tab.error) setClosingTabId(id)
    else removeTab(id)
  }, [getTab, removeTab])

  const discardAndCloseTab = useCallback(() => {
    if (closingTabId !== null) removeTab(closingTabId)
  }, [closingTabId, removeTab])

  const cancelCloseTab = useCallback(() => {
    if (closingTabId !== null) {
      setActiveTabId(closingTabId)
    }
    setClosingTabId(null)
  }, [closingTabId])

  const saveAndCloseTab = useCallback(async () => {
    if (closingTabId !== null && await saveDocument(closingTabId)) removeTab(closingTabId)
  }, [closingTabId, removeTab, saveDocument])

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? emptyDocumentTab, [activeTabId, tabs])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 's') return
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
    createNewDocument,
    discardAndCloseTab,
    openDocument,
    openDocumentAtPath,
    overwriteExternalChange,
    pasteImage,
    reloadExternalChange,
    restoreStartupSession,
    requestCloseTab,
    retainLocalChanges,
    retrySave: saveDocument,
    saveAndCloseTab,
    saveAsDocument,
    saveDocument,
    selectTab,
    tabs,
    updateMarkdown,
  }
}

function readableError(reason: unknown, fallback: string): string {
  if (typeof reason === 'string' && reason) return reason
  return reason instanceof Error && reason.message ? reason.message : fallback
}

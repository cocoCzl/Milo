import { startOpenProfile, profileAsync, stageOpenProfile } from '../diagnostics/openProfile'
import {
  inputTraceEnabled,
  isInputTraceDocument,
  scopedInputText,
  traceInput,
} from '../diagnostics/inputTrace'
import { queueDraft, readDrafts, flushDrafts } from '../file-system/draftRecovery'
import { technicalMark, technicalMeasure } from '../diagnostics/technicalProfile'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { composeMarkdownDocument, splitFrontMatter } from '../editor/markdown/documentBoundary'
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

// Safety parsing is loaded only when a document actually needs inspection.
async function inspectMarkdownDocument(markdown: string) {
  const safety = await import('../editor/markdown/documentSafety')
  return safety.inspectMarkdownDocument(markdown)
}

let documentId = 0
let diagnosticSaveId = 0

function createUntitledDocument(): DocumentSession {
  documentId += 1
  return { ...createDocumentState(documentId), recoveryId: crypto.randomUUID() }
}

export function useDocumentSession(untitledTitle = 'Untitled') {
  const autoSaveTimers = useRef(new Map<number, { signature: string; timer: number }>())
  const [watchRetry, setWatchRetry] = useState(0)
  const [openError, setOpenError] = useState<string | null>(null)
  const [tabs, setTabs] = useState<DocumentTab[]>([])
  const [activeTabId, setActiveTabId] = useState<number | null>(null)
  const [closePending, setClosePending] = useState(false)
  const [closeWaiting, setCloseWaiting] = useState<'input' | 'saving' | null>(null)
  const [closingTabId, setClosingTabId] = useState<number | null>(null)
  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)
  const selfWritesRef = useRef(new Map<number, { path: string; markdown: string }>())
  const watchReadsRef = useRef(new Map<number, object>())
  const stableWaitersRef = useRef(new Map<number, Set<(stable: boolean) => void>>())
  const flushersRef = useRef(new Map<number, () => boolean>())
  const savingRef = useRef(new Map<number, Promise<boolean>>())
  const savePickersRef = useRef(new Map<number, Promise<boolean>>())
  const [savePickerIds, setSavePickerIds] = useState<ReadonlySet<number>>(new Set())
  const removingRef = useRef(new Map<number, Promise<boolean>>())
  const closeAllRef = useRef<{ complete: () => Promise<void>; failed?: () => void } | null>(null)
  const continueCloseAllRef = useRef<() => void>(() => undefined)
  const closingRef = useRef<number | null>(null)
  const closeDecisionRef = useRef(0)
  const saveRef = useRef<(id?: number | null) => Promise<boolean>>(async () => false)
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
      traceInput('session:wait-stable', {
        id,
        revision: tab.document.revision,
        composing: getTab(id)?.isComposing ?? false,
        flushed: flushed ?? true,
      })
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

  const markContentChanged = useCallback(
    (origin: DocumentOrigin) => {
      const tab = getOriginTab(origin)
      if (!tab || tab.document.sourceMode || tab.document.protectionReason || tab.document.isDirty)
        return
      replaceTab(origin.tabId, (current) => ({
        ...current,
        document: { ...current.document, isDirty: true },
        saveFeedback: current.document.path ? 'pending' : 'idle',
      }))
    },
    [getOriginTab, replaceTab],
  )

  const updateMarkdown = useCallback(
    (origin: DocumentOrigin, markdown: string) => {
      const tab = getOriginTab(origin)
      const ignored =
        !tab ||
        tab.document.sourceMode ||
        Boolean(tab.document.protectionReason) ||
        (tab.document.markdown === markdown && !tab.document.isDirty)
      if (ignored) return

      traceInput('session:publish-markdown', {
        id: origin.tabId,
        documentId: origin.documentId,
        text: scopedInputText(isInputTraceDocument(tab.document.path), markdown),
        length: markdown.length,
        revision: tab.document.revision + 1,
      })
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
          externalChange: current.externalChange === 'pending' ? 'pending' : null,
          notice: null,
          saveFeedback: current.document.path && isDirty ? 'pending' : 'idle',
        }
      })
    },
    [getOriginTab, replaceTab],
  )

  const updateSource = useCallback(
    (origin: DocumentOrigin, source: string) => {
      const tab = getOriginTab(origin)
      if (!tab?.document.sourceMode) return
      const boundary = technicalMeasure('source-boundary', () => splitFrontMatter(source))
      technicalMeasure('source-session-update', () =>
        replaceTab(tab.id, (current) => ({
          ...current,
          document: {
            ...current.document,
            ...{ frontMatter: boundary.frontMatter, markdown: boundary.body },
            isDirty:
              current.document.persistedMarkdown === null
                ? source.length > 0
                : source !== current.document.persistedMarkdown,
            revision: current.document.revision + 1,
          },
          saveFeedback: current.document.path ? 'pending' : 'idle',
        })),
      )
    },
    [getOriginTab, replaceTab],
  )
  const setSourceMode = useCallback(
    async (id: number, sourceMode: boolean) => {
      if (!(await waitUntilStable(id))) return false
      const tab = getTab(id)
      if (
        !tab ||
        tab.activity !== 'idle' ||
        tab.isComposing ||
        tab.externalChange ||
        (tab.document.protectionReason &&
          !tab.document.protectionReason.includes('contains raw HTML'))
      )
        return false
      if (Boolean(tab.document.sourceMode) === sourceMode) return true
      const inspected = sourceMode
        ? null
        : await inspectMarkdownDocument(
            composeMarkdownDocument(tab.document.frontMatter, tab.document.markdown),
          )
      const latest = getTab(id)
      if (
        !latest ||
        latest.document.id !== tab.document.id ||
        latest.document.path !== tab.document.path ||
        latest.document.revision !== tab.document.revision ||
        latest.document.sourceMode !== tab.document.sourceMode ||
        latest.activity !== 'idle' ||
        latest.externalChange ||
        latest.isComposing
      )
        return false
      if (inspected?.protectionReason) {
        replaceTab(id, (current) => ({
          ...current,
          notice: 'source-required',
        }))
        return false
      }
      const source = composeMarkdownDocument(tab.document.frontMatter, tab.document.markdown)
      const changedSource = !sourceMode && source !== tab.document.sourceEntryText
      replaceTab(id, (current) => ({
        ...current,
        notice: null,
        document: {
          ...current.document,
          sourceMode,
          sourceEntryText: sourceMode ? source : current.document.sourceEntryText,
          sourceHistoryCheckpoint: changedSource
            ? current.document.sourceEntryText
            : current.document.sourceHistoryCheckpoint,
          sourceEntryRevision: sourceMode
            ? current.document.revision
            : current.document.sourceEntryRevision,
          protectionReason: inspected
            ? inspected.protectionReason
            : current.document.protectionReason,
          editorVersion: changedSource
            ? current.document.editorVersion + 1
            : current.document.editorVersion,
        },
      }))
      return true
    },
    [getTab, replaceTab, waitUntilStable],
  )

  const createNewDocument = useCallback(() => {
    appendTab(createUntitledDocument())
  }, [appendTab])

  const updateComposition = useCallback(
    (origin: DocumentOrigin, state: EditorComposition) => {
      if (!getOriginTab(origin)) return
      traceInput('session:composition', {
        id: origin.tabId,
        phase: state.phase,
        revision: getOriginTab(origin)!.document.revision,
      })
      if (state.phase === 'settled' && !getOriginTab(origin)?.document.sourceMode)
        updateMarkdown(origin, state.markdown)
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
    async (path: string, options?: { signal?: AbortSignal; reportError?: boolean }) => {
      const cancelled = () => options?.signal?.aborted === true
      if (cancelled()) return false
      if (options?.reportError !== false) setOpenError(null)
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
        if (cancelled()) return false
        const duplicateTab = tabsRef.current.find((tab) => tab.document.path === file.path)
        if (duplicateTab) {
          activeTabIdRef.current = duplicateTab.id
          setActiveTabId(duplicateTab.id)
          return true
        }

        const inspected = await profileAsync(profile, 'safety-parse', () =>
          inspectMarkdownDocument(file.markdown),
        )
        if (cancelled()) return false
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
        if (!cancelled() && options?.reportError !== false)
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
          const inspected = await profileAsync(profile, 'safety-parse', () =>
            inspectMarkdownDocument(file.markdown),
          )
          stageOpenProfile(file.path, profile, file.markdown)
          const duplicate = tabsRef.current.find(
            (tab) =>
              tab.id !== placeholder.id &&
              tab.activity !== 'opening' &&
              tab.document.path === file.path,
          )
          if (duplicate) {
            tabsRef.current = tabsRef.current.filter((tab) => tab.id !== placeholder.id)
            setTabs(tabsRef.current)
            if (activeTabIdRef.current === placeholder.id) {
              activeTabIdRef.current = duplicate.id
              setActiveTabId(duplicate.id)
            }
            return
          }
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
          const remaining = tabsRef.current.filter((tab) => tab.id !== placeholder.id)
          tabsRef.current = remaining
          setTabs(remaining)
          if (activeTabIdRef.current === placeholder.id) {
            const next = remaining[0]?.id ?? null
            activeTabIdRef.current = next
            setActiveTabId(next)
          }
          if (path === launchPath)
            setOpenError(`${path}: ${readableError(reason, 'Could not open this Markdown file.')}`)
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
            errorSource: 'recovery',
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
        (savedTab.document.protectionReason && !savedTab.document.sourceMode) ||
        (expectedRevision !== undefined &&
          (savedTab.document.revision !== expectedRevision ||
            savedTab.document.path !== path ||
            origin.path !== path))
      )
        return false
      const savedSnapshot = savedTab.document
      const saveId = inputTraceEnabled ? ++diagnosticSaveId : 0
      const saveTrace = {
        id: origin.tabId,
        documentId: origin.documentId,
        saveId,
        revision: savedSnapshot.revision,
      }
      traceInput('session:save-snapshot', {
        ...saveTrace,
        source: expectedRevision !== undefined ? 'autosave' : 'save',
        text: scopedInputText(isInputTraceDocument(savedSnapshot.path), savedSnapshot.markdown),
        length: savedSnapshot.markdown.length,
        composing: savedTab.isComposing,
      })
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
        traceInput('session:write-start', {
          ...saveTrace,
          latestRevision: getOriginTab(origin)?.document.revision ?? -1,
          text: scopedInputText(isInputTraceDocument(savedSnapshot.path), serializedMarkdown),
          length: serializedMarkdown.length,
        })
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
        traceInput('session:write-complete', {
          ...saveTrace,
          latestRevision: getOriginTab(origin)?.document.revision ?? -1,
          length: serializedMarkdown.length,
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
        replaceTab(origin.tabId, (tab) => {
          const isDirty =
            tab.isComposing ||
            composeMarkdownDocument(tab.document.frontMatter, tab.document.markdown) !==
              serializedMarkdown
          return {
            ...tab,
            activity: 'idle',
            document: {
              ...tab.document,
              path: savedFile.path,
              title: titleFromPath(savedFile.path),
              lineEnding: savedFile.lineEnding,
              hasBom: savedFile.hasBom,
              isDirty,
              persistedMarkdown: serializedMarkdown,
            },
            externalChange: null,
            notice: null,
            saveFeedback: isDirty ? 'pending' : 'saved',
            saveError: null,
          }
        })
        return (
          !savedSnapshot.recoveryId || (await clearRecoveryCopy(origin, savedSnapshot.recoveryId))
        )
      } catch (reason) {
        traceInput('session:write-failed', { ...saveTrace })
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
            errorSource: 'save',
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
        if (!tab || tab.isComposing || (tab.document.protectionReason && !tab.document.sourceMode))
          return false
        const defaultPath = tab.document.path ?? `${untitledTitleRef.current}.md`
        const path = await pickMarkdownSavePath(defaultPath)
        return path && (await waitUntilStable(id)) ? saveToPath(originForTab(tab), path) : false
      })().finally(() => {
        if (savePickersRef.current.get(id) === operation) {
          savePickersRef.current.delete(id)
          setSavePickerIds(new Set(savePickersRef.current.keys()))
        }
      })
      savePickersRef.current.set(id, operation)
      setSavePickerIds(new Set(savePickersRef.current.keys()))
      return operation
    },
    [getTab, originForTab, saveToPath, waitUntilStable],
  )

  const saveDocument = useCallback(
    async (id = activeTabIdRef.current) => {
      if (id === null) return false
      traceInput('session:save', {
        id,
        documentId: getTab(id)?.document.id ?? -1,
        revision: getTab(id)?.document.revision ?? -1,
      })
      const picker = savePickersRef.current.get(id)
      if (picker && !(await picker)) return false
      if (!(await waitUntilStable(id))) return false
      const tab = getTab(id)
      if (!tab || (tab.document.protectionReason && !tab.document.sourceMode)) return false
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
            errorSource: 'image',
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
        const inspected = await inspectMarkdownDocument(file.markdown)
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
          watchError: null,
          saveFeedback: 'idle',
        }))
      } catch (reason) {
        replaceTab(tabId, (tab) => ({
          ...tab,
          activity: 'idle',
          error: readableError(reason, 'Could not reload the externally changed file.'),
          errorSource: 'reload',
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
        if (file.markdown === latestTab.document.persistedMarkdown) {
          replaceTab(id, (tab) => ({ ...tab, watchError: null }))
          return
        }
        if (latestTab.document.isDirty || latestTab.isComposing) {
          replaceTab(id, (tab) => ({
            ...tab,
            externalChange: 'pending',
            notice: null,
            watchError: null,
          }))
          return
        }
        const inspected = await inspectMarkdownDocument(file.markdown)
        if (watchReadsRef.current.get(id) !== read) return
        const afterInspection = getTab(id)
        if (
          !afterInspection ||
          afterInspection.document.id !== latestTab.document.id ||
          afterInspection.document.path !== file.path
        )
          return
        if (
          afterInspection.document.revision !== latestTab.document.revision ||
          afterInspection.document.isDirty ||
          afterInspection.isComposing ||
          afterInspection.activity === 'saving'
        ) {
          replaceTab(id, (tab) => ({ ...tab, externalChange: 'pending', watchError: null }))
          return
        }

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
          watchError: null,
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

  const watchSignature =
    watchRetry +
    tabs
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
        tab.document.sourceMode,
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
  const retryWatch = useCallback(
    async (id: number) => {
      const tab = getTab(id)
      if (!tab?.document.path) return
      const watcher = watchersRef.current.get(id)
      if (watcher) {
        watcher.stopped = true
        await watcher.stop?.()
        watchersRef.current.delete(id)
      }
      replaceTab(id, (current) => ({ ...current, watchError: null }))
      await handleWatchedChange(id, tab.document.path)
      if (getTab(id)?.watchError) return
      setWatchRetry((value) => value + 1)
    },
    [getTab, handleWatchedChange, replaceTab],
  )
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
    const timers = autoSaveTimers.current
    const keep = new Set<number>()
    for (const tab of tabsRef.current) {
      const path = tab.document.path
      if (
        !path ||
        !tab.document.isDirty ||
        (tab.document.protectionReason && !tab.document.sourceMode) ||
        tab.activity !== 'idle' ||
        tab.isComposing ||
        tab.externalChange ||
        tab.saveError ||
        closeAllRef.current ||
        closingRef.current !== null
      )
        continue
      keep.add(tab.id)
      const signature = JSON.stringify([
        path,
        tab.document.id,
        tab.document.revision,
        tab.document.sourceMode,
      ])
      if (timers.get(tab.id)?.signature === signature) continue
      window.clearTimeout(timers.get(tab.id)?.timer)
      const origin = originForTab(tab)
      const revision = tab.document.revision
      const timer = window.setTimeout(() => {
        technicalMark('autosave-enqueue', { tab: tab.id, revision })
        timers.delete(tab.id)
        if (!closeAllRef.current && closingRef.current === null)
          void saveToPath(origin, path, false, revision)
      }, 1000)
      timers.set(tab.id, { signature, timer })
      technicalMark('autosave-scheduled', { tab: tab.id, revision, delayMs: 1000 })
    }
    for (const [id, entry] of timers) {
      if (!keep.has(id)) {
        window.clearTimeout(entry.timer)
        timers.delete(id)
      }
    }
    // A different tab's edits/save must never restart this document's deadline.
  }, [autoSaveSignature, closePending, closingTabId, originForTab, saveToPath])
  useEffect(() => {
    const timers = autoSaveTimers.current
    return () => {
      for (const { timer } of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

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
    const restoreTabFocus =
      document.activeElement?.closest('.document-tab') !== null &&
      document.activeElement
        ?.closest('.document-tab')
        ?.querySelector('[role="tab"]')
        ?.getAttribute('aria-controls') === `document-panel-${id}`
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
    if (restoreTabFocus)
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(
            '[role="tab"][aria-selected="true"], .application-bar__new-document',
          )
          ?.focus()
      }, 0)
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
            errorSource: 'recovery',
          }))
          return false
        })
        .finally(() => removingRef.current.delete(id))
      removingRef.current.set(id, operation)
      return operation
    },
    [getTab, removeTab, replaceTab],
  )

  const needsCloseConfirmation = useCallback(
    (tab: DocumentTab) =>
      tab.document.isDirty ||
      tab.isComposing ||
      Boolean(tab.saveError) ||
      Boolean(tab.error && tab.document.recoveryId) ||
      tab.activity === 'saving' ||
      savePickersRef.current.has(tab.id) ||
      savingRef.current.has(tab.id),
    [],
  )

  const continueCloseAll = useCallback(() => {
    const request = closeAllRef.current
    if (!request) return
    for (const tab of tabsRef.current) flushersRef.current.get(tab.id)?.()
    // Keep the IME's focus and candidate window until its actual stable
    // boundary. A close dialog (and an inert workspace) would interrupt it.
    const composing = tabsRef.current.filter((tab) => tab.isComposing)
    const writes = [...savingRef.current.values()]
    traceInput('session:continue-close', {
      composing: composing.length,
      writes: writes.length,
      dirty: tabsRef.current.filter((tab) => tab.document.isDirty).length,
    })
    if (composing.length || writes.length) {
      setCloseWaiting(composing.length ? 'input' : 'saving')
      void Promise.all([...composing.map((tab) => waitUntilStable(tab.id)), ...writes]).then(() => {
        if (closeAllRef.current === request) continueCloseAllRef.current()
      })
      return
    }
    // Drain named documents through the existing autosave policy before asking
    // for a decision. No timer is permission to snapshot unconfirmed input.
    const autosavable = tabsRef.current.filter(
      (tab) =>
        tab.document.path &&
        tab.document.isDirty &&
        !tab.saveError &&
        !tab.externalChange &&
        !tab.error &&
        tab.activity === 'idle' &&
        !savePickersRef.current.has(tab.id) &&
        (!tab.document.protectionReason || tab.document.sourceMode),
    )
    if (autosavable.length) {
      setCloseWaiting('saving')
      for (const tab of autosavable)
        traceInput('session:close-save-request', {
          id: tab.id,
          documentId: tab.document.id,
          revision: tab.document.revision,
        })
      void Promise.all(autosavable.map((tab) => saveRef.current(tab.id))).then(() => {
        if (closeAllRef.current === request) continueCloseAllRef.current()
      })
      return
    }
    setCloseWaiting(null)
    const pending = tabsRef.current.find(needsCloseConfirmation)
    if (pending) {
      closeDecisionRef.current++
      closingRef.current = pending.id
      selectTab(pending.id)
      setClosingTabId(pending.id)
      traceInput('session:close-decision', {
        id: pending.id,
        saveError: Boolean(pending.saveError),
        untitled: !pending.document.path,
      })
    } else {
      const { complete, failed } = request
      for (const tab of tabsRef.current)
        traceInput('session:close-ready', {
          id: tab.id,
          documentId: tab.document.id,
          revision: tab.document.revision,
          dirty: tab.document.isDirty,
          composing: tab.isComposing,
          persistedMatches:
            tab.document.persistedMarkdown ===
            composeMarkdownDocument(tab.document.frontMatter, tab.document.markdown),
        })
      // Keep the coordinator locked while native completion/settings flush.
      void flushDrafts()
        .then(() => {
          if (closeAllRef.current === request) {
            traceInput('session:drafts-flush-complete')
            return complete()
          }
        })
        .then(() => {
          if (closeAllRef.current !== request) return
          closeAllRef.current = null
          setClosePending(false)
        })
        .catch((reason) => {
          if (closeAllRef.current !== request) return
          failed?.()
          closeAllRef.current = null
          setClosePending(false)
          const first = tabsRef.current[0]
          if (first)
            replaceTab(first.id, (tab) => ({
              ...tab,
              error: readableError(reason, 'Could not close safely.'),
              errorSource: 'close',
            }))
        })
    }
  }, [needsCloseConfirmation, replaceTab, selectTab, waitUntilStable])
  continueCloseAllRef.current = continueCloseAll

  // A real decision remains open until Save, Discard, or Cancel. Autosave
  // is suspended while the dialog owns the document.
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
      traceInput('session:close-tab', { id, composing: getTab(id)?.isComposing ?? false })
      flushersRef.current.get(id)?.()
      const tab = getTab(id)
      if (!tab) return
      if (needsCloseConfirmation(tab)) {
        closeDecisionRef.current++
        closingRef.current = id
        selectTab(id)
        setClosingTabId(id)
      } else void removeProtectedTab(id)
    },
    [getTab, needsCloseConfirmation, removeProtectedTab, selectTab],
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
    if (id !== null && !savingRef.current.has(id) && !savePickersRef.current.has(id))
      return finishCloseTab(id, true)
  }, [finishCloseTab])

  const cancelCloseTab = useCallback(() => {
    const id = closingRef.current ?? activeTabIdRef.current
    traceInput('session:cancel-close', {
      id,
      composing: getTab(id)?.isComposing ?? false,
      waiters: id === null ? 0 : (stableWaitersRef.current.get(id)?.size ?? 0),
    })
    if (id !== null && removingRef.current.has(id)) return
    if (id !== null) selectTab(id)
    closeDecisionRef.current++
    closeAllRef.current = null
    setClosePending(false)
    setCloseWaiting(null)
    closingRef.current = null
    setClosingTabId(null)
    window.setTimeout(() => {
      const tab = getTab(id)
      if (!tab || activeTabIdRef.current !== id) return
      const target = tab.document.sourceMode ? '.source-editor textarea' : '.ProseMirror'
      document
        .querySelector<HTMLElement>(`#document-panel-${id} ${target}`)
        ?.focus({ preventScroll: true })
    }, 0)
  }, [selectTab, getTab])

  const saveAndCloseTab = useCallback(async () => {
    const id = closingRef.current
    const decision = closeDecisionRef.current
    if (id === null || getTab(id)?.isComposing) return
    const ownsDecision = () => closingRef.current === id && closeDecisionRef.current === decision
    const pending = savingRef.current.get(id)
    if (pending) await pending
    if (!ownsDecision() || !(await saveDocument(id))) return
    const tab = getTab(id)
    // A cancelled decision must never approve a newer one for the same tab.
    // Its write may finish normally, but only the owning choice may close.
    if (ownsDecision() && tab && !tab.isComposing && !tab.document.isDirty)
      await finishCloseTab(id, false)
  }, [finishCloseTab, getTab, saveDocument])

  const recoverDrafts = useCallback(async () => {
    const { drafts, errors } = await readDrafts()
    for (const draft of drafts) {
      if (tabsRef.current.some((tab) => tab.document.recoveryId === draft.id)) continue
      const inspected = await inspectMarkdownDocument(draft.markdown)
      appendTab({
        ...createUntitledDocument(),
        markdown: inspected.body,
        frontMatter: inspected.frontMatter,
        protectionReason: inspected.protectionReason,
        sourceMode: Boolean(inspected.protectionReason),
        isDirty: true,
        recoveryId: draft.id,
      })
    }
    if (errors.length) throw new Error(errors.join('\n'))
  }, [appendTab])

  const draftTimersRef = useRef(new Map<number, number>())
  const draftSignature = tabs
    .map(
      (tab) =>
        `${tab.id}:${tab.document.revision}:${tab.document.path}:${tab.document.isDirty}:${tab.isComposing}`,
    )
    .join('|')
  useEffect(() => {
    const timers = draftTimersRef.current
    for (const [id, timer] of timers) {
      const tab = getTab(id)
      if (!tab || tab.document.path || !tab.document.isDirty || tab.isComposing) {
        window.clearTimeout(timer)
        timers.delete(id)
      }
    }
    for (const tab of tabsRef.current) {
      const doc = tab.document
      if (doc.path || !doc.recoveryId || !doc.isDirty || tab.isComposing || timers.has(tab.id))
        continue
      // A maximum snapshot interval, not an indefinitely restarted idle timer.
      timers.set(
        tab.id,
        window.setTimeout(() => {
          timers.delete(tab.id)
          if (flushersRef.current.get(tab.id)?.() === false) return
          const current = getTab(tab.id)
          if (
            !current ||
            removingRef.current.has(tab.id) ||
            current.document.path ||
            current.isComposing ||
            !current.document.isDirty ||
            current.document.recoveryId !== doc.recoveryId
          )
            return
          void queueDraft(
            doc.recoveryId!,
            composeMarkdownDocument(current.document.frontMatter, current.document.markdown),
          ).catch((reason) =>
            replaceTab(tab.id, (current) => ({
              ...current,
              error: readableError(reason, 'Could not protect unsaved document.'),
              errorSource: 'recovery',
            })),
          )
        }, 600),
      )
    }
  }, [draftSignature, getTab, replaceTab])
  useEffect(() => {
    const timers = draftTimersRef.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

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
    closeWaiting,
    closeSavePending:
      closingTabId !== null &&
      (savePickerIds.has(closingTabId) || savingRef.current.has(closingTabId)),
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
    updateSource,
    setSourceMode,
    getActiveTabId: () => activeTabIdRef.current,
    updateMarkdown,
    markContentChanged,
    retryWatch,
    updateComposition,
  }
}

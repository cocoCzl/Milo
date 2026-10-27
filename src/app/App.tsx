import { listenForNativeClose, createNativeCloseHandler } from '../hooks/nativeClose'
import {
  FileText,
  Focus,
  FolderOpen,
  FolderTree,
  ListTree,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import { ApplicationMoreMenu } from '../components/ApplicationMoreMenu'
import { FileSidebar } from '../components/FileSidebar'
import { IconButton } from '../components/IconButton'
import { ModeSwitch } from '../components/ModeSwitch'
import { OutlineToggle } from '../components/OutlineToggle'
import { PreferencesDialog } from '../components/PreferencesDialog'
import { Tooltip } from '../components/Tooltip'
import {
  browseMarkdownFolder,
  pickMarkdownFolder,
  type MarkdownTreeNode,
} from '../file-system/nativeMarkdownFile'
import { initialLaunchMarkdownFile } from '../file-system/launchFile'
import { useDocumentSession } from '../hooks/useDocumentSession'
import type { DocumentTab } from '../hooks/documentSessionModel'
import { useNativeFileOpenListener } from '../hooks/useNativeFileOpenListener'
import { useNativeCommandListener } from '../hooks/useNativeCommandListener'
import { useApplicationSettings } from '../settings/useApplicationSettings'
import { useEffectiveColorScheme } from '../settings/useEffectiveColorScheme'
import type { PresentationMode } from './presentationMode'
import { interfaceCopy, resolveLocale } from './interfaceCopy'
import { displayDocumentTitle } from './documentPresentation'
import { DocumentContext } from './DocumentContext'
import { DocumentPanel } from './DocumentPanel'
import { pruneTabState } from './tabViewState'

type DocumentViewState = {
  scrollTop: number
}

const SIDEBAR_RESPONSIVE_QUERY = '(max-width: 900px)'

export function App() {
  const {
    isLoading,
    flushSettings,
    setAppearance,
    setDocumentFontStyle,
    setDocumentZoom,
    setInterfaceZoom,
    setLineHeight,
    setLocale,
    setReadingWidth,
    setStartupSession,
    settings,
    settingsError,
    updateWorkspaceSettings,
  } = useApplicationSettings()
  const locale = resolveLocale(settings.locale)
  const copy = useMemo(() => interfaceCopy(locale), [locale])
  const session = useDocumentSession(copy.untitled)
  const {
    updateMarkdown,
    updateComposition,
    registerFlush,
    pasteImage,
    reloadExternalChange,
    retainLocalChanges,
    overwriteExternalChange,
    saveAsDocument,
    retrySave,
  } = session
  const panelActions = useMemo(
    () => ({
      updateMarkdown,
      updateComposition,
      registerFlush,
      pasteImage,
      reloadExternalChange,
      retainLocalChanges,
      overwriteExternalChange,
      saveAsDocument,
      retrySave,
    }),
    [
      updateMarkdown,
      updateComposition,
      registerFlush,
      pasteImage,
      reloadExternalChange,
      retainLocalChanges,
      overwriteExternalChange,
      saveAsDocument,
      retrySave,
    ],
  )
  const { openDocumentAtPath, restoreStartupSession } = session
  const closeSessionRef = useRef(session)
  const flushSettingsRef = useRef(flushSettings)
  closeSessionRef.current = session
  flushSettingsRef.current = flushSettings
  const nativeClose = useMemo(
    () =>
      createNativeCloseHandler(
        (complete, failed) => closeSessionRef.current.requestCloseAll(complete, failed),
        () => flushSettingsRef.current(),
      ),
    [],
  )
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void listenForNativeClose((kind) => {
      if (!disposed) nativeClose.request(kind)
    })
      .then((unlisten) => {
        if (disposed) unlisten()
        else stop = unlisten
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      stop?.()
    }
  }, [nativeClose])
  const colorScheme = useEffectiveColorScheme(settings.appearance)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [folderTree, setFolderTree] = useState<MarkdownTreeNode | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [startupSessionRestored, setStartupSessionRestored] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [presentationModes, setPresentationModes] = useState<
    Partial<Record<number, PresentationMode>>
  >({})
  const [documentViewStates, setDocumentViewStates] = useState<
    Partial<Record<DocumentTab['id'], DocumentViewState>>
  >({})
  const [outlineOpen, setOutlineOpen] = useState<Partial<Record<number, boolean>>>({})
  const [outlineLayout, setOutlineLayout] = useState<'inline' | 'drawer'>('drawer')
  const [sidebarResponsiveHidden, setSidebarResponsiveHidden] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia(SIDEBAR_RESPONSIVE_QUERY).matches,
  )
  const didRestoreStartupSession = useRef(false)
  const initialLaunchFilePromiseRef = useRef<Promise<string | null> | null>(null)
  const lastRecordedRecentPathRef = useRef<string | null | undefined>(undefined)
  const preferencesReturnFocusRef = useRef<HTMLElement | null>(null)
  const documentStageRef = useRef<HTMLElement>(null)
  const previousActiveTabIdRef = useRef<DocumentTab['id'] | null>(null)
  const documentViewStatesRef = useRef<Partial<Record<DocumentTab['id'], DocumentViewState>>>({})
  const outlineToggleRef = useRef<HTMLButtonElement>(null)
  const focusOutlineTriggerRef = useRef<HTMLButtonElement>(null)
  const [outlineDrawerMount, setOutlineDrawerMount] = useState<HTMLElement | null>(null)
  const [outlineInlineMount, setOutlineInlineMount] = useState<HTMLElement | null>(null)
  const [preferencesDialogMount, setPreferencesDialogMount] = useState<HTMLElement | null>(null)
  const [contextualOverlayMount, setContextualOverlayMount] = useState<HTMLElement | null>(null)
  const closingTab = session.tabs.find((tab) => tab.id === session.closingTabId) ?? null
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const draftsRecoveredRef = useRef(false)
  useEffect(() => {
    if (!startupSessionRestored || draftsRecoveredRef.current) return
    draftsRecoveredRef.current = true
    void session.recoverDrafts().catch((reason) => setRecoveryError(String(reason)))
  }, [session, startupSessionRestored])
  useEffect(() => {
    if (session.closingTabId !== null)
      document.querySelector<HTMLElement>('.close-confirmation button:last-child')?.focus()
  }, [session.closingTabId])
  const activeTabId = session.activeTabId
  const activeTab =
    activeTabId === null ? null : (session.tabs.find((tab) => tab.id === activeTabId) ?? null)
  const hasActiveDocument = activeTabId !== null
  const activePresentationMode =
    activeTabId === null ? 'edit' : (presentationModes[activeTabId] ?? 'edit')
  const activeDocumentIsProtected = session.document.protectionReason !== null
  const sidebarAvailable = !sidebarResponsiveHidden
  const sidebarVisible = settings.sidebarVisible && sidebarAvailable
  const activeOutlineOpen =
    activeTabId !== null && (outlineOpen[activeTabId] ?? (outlineLayout === 'inline' && !focusMode))

  const tabIdsSignature = session.tabs.map((tab) => tab.id).join(',')
  useEffect(() => {
    const openTabIds = new Set(tabIdsSignature.split(',').filter(Boolean).map(Number))
    setPresentationModes((current) => pruneTabState(current, openTabIds))
    setDocumentViewStates((current) => pruneTabState(current, openTabIds))
    setOutlineOpen((current) => pruneTabState(current, openTabIds))
  }, [tabIdsSignature])

  const closePanelOutline = useCallback(
    (id: number) => {
      setOutlineOpen((current) => ({ ...current, [id]: false }))
      queueMicrotask(() => (focusMode ? focusOutlineTriggerRef : outlineToggleRef).current?.focus())
    },
    [focusMode],
  )

  const closeActiveOutline = useCallback(() => {
    if (activeTabId === null) return
    setOutlineOpen((current) =>
      current[activeTabId] ? { ...current, [activeTabId]: false } : current,
    )
  }, [activeTabId])

  const toggleFocusMode = useCallback(() => {
    closeActiveOutline()
    setFocusMode((active) => !active)
  }, [closeActiveOutline])

  const exitFocusMode = useCallback(() => {
    closeActiveOutline()
    setFocusMode(false)
  }, [closeActiveOutline])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mediaQuery = window.matchMedia(SIDEBAR_RESPONSIVE_QUERY)
    const update = () => setSidebarResponsiveHidden(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  const saveDocumentScroll = useCallback(
    (tabId: DocumentTab['id'], scrollTop: number, publish = false) => {
      const viewState = { scrollTop: Math.max(0, scrollTop) }
      documentViewStatesRef.current = {
        ...documentViewStatesRef.current,
        [tabId]: viewState,
      }
      if (!publish) return
      setDocumentViewStates((current) =>
        current[tabId]?.scrollTop === viewState.scrollTop
          ? current
          : { ...current, [tabId]: viewState },
      )
    },
    [],
  )

  const selectTab = useCallback(
    (tabId: DocumentTab['id']) => {
      const stage = documentStageRef.current
      const currentTabId = previousActiveTabIdRef.current ?? session.activeTabId
      if (stage && currentTabId !== null) saveDocumentScroll(currentTabId, stage.scrollTop, true)
      session.selectTab(tabId)
    },
    [saveDocumentScroll, session],
  )

  useEffect(() => {
    const documentStage = documentStageRef.current
    if (!documentStage) return
    const update = () =>
      setOutlineLayout((current) => {
        // This is the actual column left after the resizable sidebar, rather
        // than the browser viewport.  It needs room for the editor rail, a
        // readable article and the inline navigation column.
        const next = documentStage.clientWidth >= 1150 ? 'inline' : 'drawer'
        return current === next ? current : next
      })
    update()
    if (!window.ResizeObserver) return undefined
    const observer = new ResizeObserver(update)
    observer.observe(documentStage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const stage = documentStageRef.current
    if (!stage) return undefined
    const rememberScroll = () => {
      const tabId = previousActiveTabIdRef.current
      if (tabId !== null) saveDocumentScroll(tabId, stage.scrollTop)
    }
    stage.addEventListener('scroll', rememberScroll, { passive: true })
    return () => stage.removeEventListener('scroll', rememberScroll)
  }, [saveDocumentScroll])

  // All document panels deliberately share one physical scroll root so the
  // workspace has one stable scrollbar.  Its offset, however, is view state:
  // it belongs to the active tab and must never leak to the next document.
  // A layout effect observes the previous tab id after React has swapped the
  // visible panel, but before paint.  At that point the stage still contains
  // the previous offset, so it can be saved under the correct tab id and the
  // incoming tab's offset can be restored without a visible jump.
  useLayoutEffect(() => {
    const stage = documentStageRef.current
    const nextTabId = session.activeTabId
    const previousTabId = previousActiveTabIdRef.current

    if (nextTabId === null) {
      previousActiveTabIdRef.current = null
      if (stage) stage.scrollTop = 0
      return
    }

    if (!stage) {
      previousActiveTabIdRef.current = nextTabId
      return
    }

    if (previousTabId === null) {
      previousActiveTabIdRef.current = nextTabId
      return
    }

    if (previousTabId === nextTabId) return

    // Prefer the value cached by the passive scroll listener.  React may have
    // already hidden a much taller outgoing document, in which case the
    // browser can clamp the shared stage before this layout effect runs.
    const previousScrollTop =
      documentViewStatesRef.current[previousTabId]?.scrollTop ?? stage.scrollTop
    saveDocumentScroll(previousTabId, previousScrollTop, true)

    const nextScrollTop =
      documentViewStatesRef.current[nextTabId]?.scrollTop ??
      documentViewStates[nextTabId]?.scrollTop ??
      0
    const maxScrollTop = Math.max(0, stage.scrollHeight - stage.clientHeight)
    stage.scrollTop = Math.min(maxScrollTop, Math.max(0, nextScrollTop))
    previousActiveTabIdRef.current = nextTabId
  }, [documentViewStates, saveDocumentScroll, session.activeTabId])
  const appStyle = {
    '--editor-font-size': `${Number((16.5 * (settings.documentZoom / 100)).toFixed(2))}px`,
    '--ui-font-lg': `${Number((13 * (settings.interfaceZoom / 100)).toFixed(2))}px`,
    '--ui-font-mark': `${Number((12.5 * (settings.interfaceZoom / 100)).toFixed(2))}px`,
    '--ui-font-md': `${Number((12 * (settings.interfaceZoom / 100)).toFixed(2))}px`,
    '--ui-font-sm': `${Number((11 * (settings.interfaceZoom / 100)).toFixed(2))}px`,
    '--ui-font-xs': `${Number((10 * (settings.interfaceZoom / 100)).toFixed(2))}px`,
    '--sidebar-width': `${settings.sidebarWidth}px`,
  } as CSSProperties

  useEffect(() => {
    initialLaunchFilePromiseRef.current ??= initialLaunchMarkdownFile().catch(() => null)
  }, [])

  useEffect(() => {
    if (isLoading || didRestoreStartupSession.current) return
    didRestoreStartupSession.current = true
    let disposed = false
    const launchFilePromise =
      initialLaunchFilePromiseRef.current ?? initialLaunchMarkdownFile().catch(() => null)
    initialLaunchFilePromiseRef.current = launchFilePromise
    void launchFilePromise
      .then((launchPath) => restoreStartupSession(settings.startupSession, launchPath))
      .then(() => {
        if (!disposed) setStartupSessionRestored(true)
      })
    return () => {
      disposed = true
    }
  }, [isLoading, restoreStartupSession, settings.startupSession])

  useEffect(() => {
    if (!startupSessionRestored) return
    const openDocumentPaths = session.tabs.flatMap((tab) =>
      tab.document.path ? [tab.document.path] : [],
    )
    const activeDocumentPath = session.document.path
    const currentSession = settings.startupSession
    const samePaths =
      openDocumentPaths.length === currentSession.openDocumentPaths.length &&
      openDocumentPaths.every((path, index) => path === currentSession.openDocumentPaths[index])
    if (activeDocumentPath === currentSession.activeDocumentPath && samePaths) return
    setStartupSession({ activeDocumentPath, openDocumentPaths })
  }, [
    session.activeTabId,
    session.document.path,
    session.tabs,
    setStartupSession,
    settings.startupSession,
    startupSessionRestored,
  ])

  useEffect(() => {
    if (!settings.currentFolder) {
      setFolderTree(null)
      return
    }
    let disposed = false
    setFolderError(null)
    setFolderTree(null)
    void browseMarkdownFolder(settings.currentFolder)
      .then((tree) => {
        if (!disposed) {
          setFolderTree(tree)
          setFolderError(null)
        }
      })
      .catch((reason) => {
        if (!disposed) {
          setFolderError(
            reason instanceof Error && reason.message ? reason.message : copy.folderBrowseFailed,
          )
          updateWorkspaceSettings({
            currentFolder: null,
            recentFolders: settings.recentFolders.filter(
              (folder) => folder !== settings.currentFolder,
            ),
          })
        }
      })
    return () => {
      disposed = true
    }
  }, [
    copy.folderBrowseFailed,
    settings.currentFolder,
    settings.recentFolders,
    updateWorkspaceSettings,
  ])

  useEffect(() => {
    const path = session.document.path
    if (lastRecordedRecentPathRef.current === path) return
    lastRecordedRecentPathRef.current = path
    if (!path || settings.recentFiles[0] === path) return
    updateWorkspaceSettings({
      currentFolder: settings.currentFolder,
      recentFiles: [path, ...settings.recentFiles.filter((item) => item !== path)].slice(0, 12),
      recentFolders: settings.recentFolders,
      sidebarVisible: settings.sidebarVisible,
      sidebarWidth: settings.sidebarWidth,
    })
  }, [session.document.path, settings, updateWorkspaceSettings])

  const clearRecent = () =>
    updateWorkspaceSettings({
      ...workspaceSettings(settings),
      recentFiles: [],
      recentFolders: [],
    })

  const removeRecentFile = (path: string) =>
    updateWorkspaceSettings({
      ...workspaceSettings(settings),
      recentFiles: settings.recentFiles.filter((file) => file !== path),
    })

  const removeRecentFolder = (path: string) =>
    updateWorkspaceSettings({
      ...workspaceSettings(settings),
      recentFolders: settings.recentFolders.filter((folder) => folder !== path),
    })

  const chooseCurrentFolder = async () => {
    const folder = await pickMarkdownFolder()
    if (!folder) return
    setCurrentFolder(folder)
  }

  const createNewDocument = () => session.createNewDocument()
  const openDocument = () => {
    void session.openDocument()
  }
  const openFolder = () => {
    void chooseCurrentFolder()
  }
  const saveActiveDocument = () => {
    if (activeTabId !== null) void session.saveDocument(activeTabId)
  }
  const saveActiveDocumentAs = () => {
    if (activeTabId !== null) void session.saveAsDocument(activeTabId)
  }
  const openPreferences = (returnFocusTarget?: HTMLElement | null) => {
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    preferencesReturnFocusRef.current =
      returnFocusTarget ??
      activeElement
        ?.closest('.application-more-menu')
        ?.querySelector<HTMLElement>('.application-more-menu__trigger') ??
      activeElement
    setPreferencesOpen(true)
  }

  const setCurrentFolder = (folder: string) => {
    updateWorkspaceSettings({
      currentFolder: folder,
      recentFiles: settings.recentFiles,
      recentFolders: [folder, ...settings.recentFolders.filter((item) => item !== folder)].slice(
        0,
        8,
      ),
      sidebarVisible: true,
      sidebarWidth: settings.sidebarWidth,
    })
  }

  const openSidebarFile = async (path: string) => {
    if (await session.openDocumentAtPath(path)) return
    updateWorkspaceSettings({
      ...workspaceSettings(settings),
      recentFiles: settings.recentFiles.filter((file) => file !== path),
    })
  }

  useNativeCommandListener((command) => {
    switch (command) {
      case 'new-document':
        createNewDocument()
        break
      case 'open-document':
        openDocument()
        break
      case 'save-document':
        saveActiveDocument()
        break
      case 'save-as':
        saveActiveDocumentAs()
        break
      case 'open-folder':
        openFolder()
        break
      case 'toggle-sidebar':
        updateWorkspaceSettings({ sidebarVisible: !settings.sidebarVisible })
        break
      case 'toggle-focus-mode':
        toggleFocusMode()
        break
      case 'zoom-in':
        setDocumentZoom(settings.documentZoom + 10)
        break
      case 'zoom-out':
        setDocumentZoom(settings.documentZoom - 10)
        break
      case 'zoom-reset':
        setDocumentZoom(100)
        break
      case 'find-document':
        window.dispatchEvent(new Event('milo:find'))
        break
      case 'format-bold':
        document.execCommand('bold')
        break
      case 'format-italic':
        document.execCommand('italic')
        break
    }
  })

  useNativeFileOpenListener((path) => {
    void openDocumentAtPath(path)
  })

  useEffect(() => {
    const handleZoomShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (event.key === '0') {
        event.preventDefault()
        setDocumentZoom(100)
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        setDocumentZoom(settings.documentZoom + 10)
      } else if (event.key === '-') {
        event.preventDefault()
        setDocumentZoom(settings.documentZoom - 10)
      }
    }
    window.addEventListener('keydown', handleZoomShortcut)
    return () => window.removeEventListener('keydown', handleZoomShortcut)
  }, [setDocumentZoom, settings.documentZoom])

  useEffect(() => {
    const handleFocusShortcut = (event: KeyboardEvent) => {
      if (preferencesOpen) return
      if (event.key === 'Escape' && focusMode) {
        event.preventDefault()
        if (activeOutlineOpen) {
          closeActiveOutline()
          queueMicrotask(() => focusOutlineTriggerRef.current?.focus())
          return
        }
        exitFocusMode()
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        toggleFocusMode()
      }
    }
    window.addEventListener('keydown', handleFocusShortcut)
    return () => window.removeEventListener('keydown', handleFocusShortcut)
  }, [
    activeOutlineOpen,
    closeActiveOutline,
    exitFocusMode,
    focusMode,
    preferencesOpen,
    toggleFocusMode,
  ])

  useEffect(() => {
    const closeOutlineOnEscape = (event: KeyboardEvent) => {
      if (
        activeTabId === null ||
        event.key !== 'Escape' ||
        focusMode ||
        preferencesOpen ||
        outlineLayout !== 'drawer' ||
        !outlineOpen[activeTabId]
      )
        return
      setOutlineOpen((current) => ({ ...current, [activeTabId]: false }))
      queueMicrotask(() => outlineToggleRef.current?.focus())
    }
    window.addEventListener('keydown', closeOutlineOnEscape)
    return () => window.removeEventListener('keydown', closeOutlineOnEscape)
  }, [activeTabId, focusMode, outlineLayout, outlineOpen, preferencesOpen])

  return (
    <main
      className={`app-shell${sidebarVisible && !focusMode ? ' app-shell--with-sidebar' : ''}${focusMode ? ' app-shell--focus-mode' : ''}${outlineLayout === 'inline' && activeOutlineOpen ? ' app-shell--inline-outline' : ''}${preferencesOpen ? ' app-shell--dialog-open' : ''}`}
      aria-label={copy.appLabel}
      data-appearance={settings.appearance}
      data-theme={colorScheme}
      data-color-scheme={colorScheme}
      data-document-font-style={settings.documentFontStyle}
      data-line-height={settings.lineHeight}
      data-reading-width={settings.readingWidth}
      lang={locale}
      style={appStyle}
    >
      <header
        inert={session.closePending || Boolean(closingTab)}
        className="application-bar window-bar"
      >
        <div className="application-bar__tabs">
          <nav className="tab-strip" aria-label={copy.openDocuments} role="tablist">
            {session.tabs.map((tab) => (
              <div
                key={tab.id}
                className={`document-tab${tab.id === session.activeTabId ? ' document-tab--active' : ''}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab.id === session.activeTabId}
                  aria-controls={`document-panel-${tab.id}`}
                  title={tab.document.path ?? copy.untitled}
                  onClick={() => selectTab(tab.id)}
                >
                  <FileText
                    aria-hidden="true"
                    className="document-tab__icon"
                    size={14}
                    strokeWidth={1.7}
                  />
                  <span className="document-tab__dirty" aria-hidden="true">
                    {tab.document.isDirty ? '•' : ''}
                  </span>
                  <span className="document-tab__title">{displayDocumentTitle(tab, copy)}</span>
                </button>
                <button
                  className="document-tab__close"
                  type="button"
                  aria-label={copy.closeDocument(displayDocumentTitle(tab, copy))}
                  onClick={() => session.requestCloseTab(tab.id)}
                >
                  <X aria-hidden="true" size={13} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </nav>
          <IconButton
            className="application-bar__new-document"
            label={copy.newDocument}
            onClick={createNewDocument}
          >
            <Plus aria-hidden="true" size={16} strokeWidth={1.8} />
          </IconButton>
        </div>
        <div className="window-bar__actions">
          {activeTabId !== null && activeTab ? (
            <DocumentContext
              copy={copy}
              document={activeTab.document}
              folder={settings.currentFolder}
              onSave={saveActiveDocument}
              saveDisabled={
                activeTab.activity !== 'idle' || activeTab.document.protectionReason !== null
              }
              tab={activeTab}
            />
          ) : null}

          <div className="application-bar__group application-bar__group--primary">
            <ModeSwitch
              disabled={!hasActiveDocument || activeDocumentIsProtected}
              editLabel={copy.edit}
              mode={activePresentationMode}
              readLabel={copy.read}
              onChange={(mode) => {
                if (activeTabId !== null)
                  setPresentationModes((current) => ({ ...current, [activeTabId]: mode }))
              }}
            />
          </div>
          <div className="application-bar__group application-bar__group--layout">
            <IconButton
              className="application-bar__sidebar-toggle"
              aria-pressed={sidebarVisible}
              disabled={!sidebarAvailable}
              label={
                !sidebarAvailable
                  ? copy.sidebarUnavailable
                  : settings.sidebarVisible
                    ? copy.hideSidebar
                    : copy.showSidebar
              }
              onClick={() =>
                updateWorkspaceSettings({
                  ...workspaceSettings(settings),
                  sidebarVisible: !settings.sidebarVisible,
                })
              }
            >
              {sidebarVisible ? (
                <PanelLeftClose aria-hidden="true" size={16} strokeWidth={1.7} />
              ) : (
                <PanelLeftOpen aria-hidden="true" size={16} strokeWidth={1.7} />
              )}
            </IconButton>
            {activeTabId !== null && !focusMode && !activeDocumentIsProtected ? (
              <OutlineToggle
                buttonRef={outlineToggleRef}
                expanded={activeOutlineOpen}
                label={copy.editor.outline}
                tooltipLabel={activeOutlineOpen ? copy.editor.closeOutline : copy.openOutline}
                onClick={() =>
                  setOutlineOpen((current) => ({
                    ...current,
                    [activeTabId]: !(
                      current[activeTabId] ??
                      (!focusMode && outlineLayout === 'inline')
                    ),
                  }))
                }
              />
            ) : null}
            <IconButton
              className="application-bar__focus-toggle"
              label={focusMode ? copy.exitFocusMode : copy.enterFocusMode}
              onClick={toggleFocusMode}
            >
              <Focus aria-hidden="true" size={16} strokeWidth={1.7} />
            </IconButton>
          </div>
          <div className="preferences-menu application-bar__group application-bar__group--overflow">
            <ApplicationMoreMenu
              dismissed={focusMode}
              labels={{
                more: copy.moreActions,
                open: `${copy.openDocument}…`,
                openFolder: `${copy.openFolder}…`,
                saveAs: `${copy.saveAs}…`,
                settings: `${copy.sidebar.settings}…`,
              }}
              onOpen={openDocument}
              onOpenFolder={openFolder}
              onOpenSettings={(trigger) => openPreferences(trigger)}
              onSaveAs={saveActiveDocumentAs}
              saveAsDisabled={
                !hasActiveDocument || session.activity !== 'idle' || activeDocumentIsProtected
              }
              shortcuts={{ open: '⌘O', openFolder: '⇧⌘O', saveAs: '⇧⌘S' }}
            />
          </div>
        </div>
      </header>
      <section inert={session.closePending || Boolean(closingTab)} className="app-workspace">
        {sidebarVisible ? (
          <FileSidebar
            copy={copy.sidebar}
            folder={settings.currentFolder}
            activeFile={session.document.path}
            tree={folderTree}
            folderError={folderError}
            width={settings.sidebarWidth}
            onChooseFolder={() => void chooseCurrentFolder()}
            onClearRecent={clearRecent}
            onOpenFile={(path) => void openSidebarFile(path)}
            onOpenFolder={setCurrentFolder}
            onOpenPreferences={() =>
              openPreferences(document.querySelector<HTMLElement>('.file-sidebar__footer button'))
            }
            onRemoveRecentFile={removeRecentFile}
            onRemoveRecentFolder={removeRecentFolder}
            onWidthChange={(sidebarWidth) =>
              updateWorkspaceSettings({ ...workspaceSettings(settings), sidebarWidth })
            }
            recentFiles={settings.recentFiles}
            recentFolders={settings.recentFolders}
          />
        ) : null}
        {folderError && !sidebarVisible ? (
          <div className="folder-error" role="status">
            {folderError}
          </div>
        ) : null}
        <section
          className={`document-area${activeTab || !startupSessionRestored ? '' : ' document-area--empty'}${startupSessionRestored ? '' : ' document-area--restoring'}`}
          aria-busy={!startupSessionRestored}
          aria-label={copy.currentDocument}
        >
          {focusMode ? (
            <button className="focus-mode-exit" type="button" onClick={exitFocusMode}>
              {copy.exitFocusMode} · Esc
            </button>
          ) : null}
          {focusMode && activeTabId !== null && !activeDocumentIsProtected ? (
            <Tooltip content={copy.openOutline} disabled={activeOutlineOpen}>
              <button
                ref={focusOutlineTriggerRef}
                aria-controls="outline-drawer"
                aria-expanded={activeOutlineOpen}
                aria-label={copy.openOutline}
                className="focus-mode-outline-trigger"
                type="button"
                onClick={() =>
                  setOutlineOpen((current) => ({
                    ...current,
                    [activeTabId]: !(
                      current[activeTabId] ??
                      (!focusMode && outlineLayout === 'inline')
                    ),
                  }))
                }
              >
                <ListTree aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
            </Tooltip>
          ) : null}
          <section className="document-stage" ref={documentStageRef}>
            {!activeTab && startupSessionRestored ? (
              <div className="document-empty-state">
                <span aria-hidden="true" className="document-empty-state__icon">
                  <FileText size={22} strokeWidth={1.5} />
                </span>
                <strong>{copy.emptyDocumentTitle}</strong>
                <p>{copy.emptyDocumentDescription}</p>
                <div className="document-empty-state__actions">
                  <button type="button" onClick={openDocument}>
                    <FolderOpen aria-hidden="true" size={15} strokeWidth={1.7} />
                    {copy.openDocument}
                  </button>
                  <button type="button" onClick={openFolder}>
                    <FolderTree aria-hidden="true" size={15} strokeWidth={1.7} />
                    {copy.openFolder}
                  </button>
                </div>
              </div>
            ) : null}
            {session.tabs.map((tab) => (
              <DocumentPanel
                key={tab.id}
                tab={tab}
                actions={panelActions}
                copy={copy}
                title={displayDocumentTitle(tab, copy)}
                active={tab.id === session.activeTabId}
                outlineLayout={focusMode || !activeOutlineOpen ? 'drawer' : outlineLayout}
                outlineOpen={tab.id === activeTabId && activeOutlineOpen}
                presentationMode={presentationModes[tab.id] ?? 'edit'}
                onCloseOutline={closePanelOutline}
                outlineDrawerMount={outlineDrawerMount}
                outlineInlineMount={outlineInlineMount}
                contextualOverlayMount={contextualOverlayMount}
              />
            ))}
          </section>
          {/* Share the stage's grid tracks, but not its scrolling coordinate
              space. The available grid row bounds the outline at every size. */}
          <div
            ref={setOutlineInlineMount}
            className="outline-inline-layer"
            hidden={focusMode || outlineLayout !== 'inline' || !activeTab || !activeOutlineOpen}
          />
          {/* Keep the drawer portal in the non-scrolling document-area layer.
              WKWebView can expose a root-grid overlay in the AX tree without
              reliably painting it above the document-stage compositor. */}
          <div ref={setOutlineDrawerMount} className="outline-drawer-layer" />
          <div ref={setPreferencesDialogMount} className="preferences-dialog-layer" />
        </section>
      </section>
      <div ref={setContextualOverlayMount} className="contextual-overlay-layer" />
      <PreferencesDialog
        appearance={settings.appearance}
        copy={{
          appearance: copy.appearance,
          appearanceSection: copy.preferencesAppearance,
          close: copy.closePreferences,
          dark: copy.dark,
          documentFont: copy.documentFont,
          editingSection: copy.preferencesReading,
          decreaseDocumentSize: copy.decreaseZoom,
          decreaseInterfaceSize: copy.decreaseInterfaceSize,
          displaySection: copy.preferencesDisplay,
          documentSize: copy.zoom,
          increaseDocumentSize: copy.increaseZoom,
          increaseInterfaceSize: copy.increaseInterfaceSize,
          interfaceSize: copy.interfaceSize,
          language: copy.language,
          lineHeight: copy.lineHeight,
          lineHeightCompact: copy.lineHeightCompact,
          lineHeightRelaxed: copy.lineHeightRelaxed,
          lineHeightStandard: copy.lineHeightStandard,
          light: copy.light,
          system: copy.system,
          readingSerif: copy.readingSerif,
          readingWidth: copy.readingWidth,
          readingWidthNarrow: copy.readingWidthNarrow,
          readingWidthStandard: copy.readingWidthStandard,
          readingWidthWide: copy.readingWidthWide,
          systemSans: copy.systemSans,
          title: copy.preferences,
          warm: copy.warm,
        }}
        documentZoom={settings.documentZoom}
        documentFontStyle={settings.documentFontStyle}
        error={settingsError}
        interfaceZoom={settings.interfaceZoom}
        lineHeight={settings.lineHeight}
        locale={settings.locale}
        onAppearanceChange={setAppearance}
        onDocumentZoomChange={setDocumentZoom}
        onDocumentFontStyleChange={setDocumentFontStyle}
        onInterfaceZoomChange={setInterfaceZoom}
        onLocaleChange={setLocale}
        onLineHeightChange={setLineHeight}
        onOpenChange={setPreferencesOpen}
        onReadingWidthChange={setReadingWidth}
        open={preferencesOpen}
        portalContainer={preferencesDialogMount}
        readingWidth={settings.readingWidth}
        returnFocusRef={preferencesReturnFocusRef}
        theme={colorScheme}
      />
      {session.openError ? (
        <div className="document-error" role="alert">
          {session.openError}
        </div>
      ) : null}
      {recoveryError ? (
        <div className="document-error" role="alert">
          {recoveryError}
        </div>
      ) : null}
      {closingTab ? (
        <section
          className="close-confirmation"
          role="alertdialog"
          aria-modal="true"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              session.cancelCloseTab()
              void nativeClose.cancel().catch(() => undefined)
            }
            if (event.key === 'Tab') {
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              ]
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
              event.preventDefault()
              buttons[
                (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
              ]?.focus()
            }
          }}
          aria-labelledby="close-confirmation-title"
        >
          <strong id="close-confirmation-title">
            {copy.closeConfirmation(displayDocumentTitle(closingTab, copy))}
          </strong>
          <span>{closingTab.saveError ? copy.lastSaveFailed : copy.unsavedChanges}</span>
          <div className="close-confirmation__actions">
            <button
              type="button"
              disabled={closingTab.activity === 'saving'}
              onClick={session.discardAndCloseTab}
            >
              {copy.discardChanges}
            </button>
            <button
              type="button"
              disabled={closingTab.isComposing || closingTab.activity === 'saving'}
              onClick={() => void session.saveAndCloseTab()}
            >
              {copy.saveAndClose}
            </button>
            <button
              type="button"
              onClick={() => {
                session.cancelCloseTab()
                void nativeClose.cancel().catch(() => undefined)
              }}
            >
              {copy.keepEditing}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  )
}

function workspaceSettings(
  settings: import('../settings/applicationSettings').ApplicationSettings,
) {
  return {
    currentFolder: settings.currentFolder,
    recentFiles: settings.recentFiles,
    recentFolders: settings.recentFolders,
    sidebarVisible: settings.sidebarVisible,
    sidebarWidth: settings.sidebarWidth,
  }
}

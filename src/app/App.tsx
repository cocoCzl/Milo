import { FilePlus2, FileText, Focus, FolderOpen, FolderTree, Minus, PanelLeftClose, PanelLeftOpen, Plus, Save, Settings2, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { FileSidebar } from '../components/FileSidebar'
import { IconButton } from '../components/IconButton'
import { ModeSwitch } from '../components/ModeSwitch'
import { OutlineToggle } from '../components/OutlineToggle'
import { MilkdownEditor } from '../editor/milkdown/MilkdownEditor'
import { browseMarkdownFolder, pickMarkdownFolder, type MarkdownTreeNode } from '../file-system/nativeMarkdownFile'
import { initialLaunchMarkdownFile } from '../file-system/launchFile'
import { type DocumentTab, useDocumentSession } from '../hooks/useDocumentSession'
import { useNativeFileOpenListener } from '../hooks/useNativeFileOpenListener'
import { useNativeCommandListener } from '../hooks/useNativeCommandListener'
import { type InterfaceLocale } from '../settings/applicationSettings'
import { useApplicationSettings } from '../settings/useApplicationSettings'
import { useEffectiveColorScheme } from '../settings/useEffectiveColorScheme'
import type { PresentationMode } from './presentationMode'

type DocumentViewState = {
  scrollTop: number
}

export function App() {
  const { isLoading, setAppearance, setDocumentZoom, setInterfaceZoom, setLocale, setStartupSession, settings, settingsError, updateWorkspaceSettings } = useApplicationSettings()
  const locale = resolveLocale(settings.locale)
  const copy = useMemo(() => interfaceCopy(locale), [locale])
  const session = useDocumentSession(copy.untitled)
  const { openDocumentAtPath, restoreStartupSession } = session
  const colorScheme = useEffectiveColorScheme(settings.appearance)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [folderTree, setFolderTree] = useState<MarkdownTreeNode | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [startupSessionRestored, setStartupSessionRestored] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [presentationModes, setPresentationModes] = useState<Record<number, PresentationMode>>({})
  const [documentViewStates, setDocumentViewStates] = useState<Record<DocumentTab['id'], DocumentViewState>>({})
  const [outlineOpen, setOutlineOpen] = useState<Record<number, boolean>>({})
  const [outlineLayout, setOutlineLayout] = useState<'inline' | 'drawer'>('drawer')
  const didRestoreStartupSession = useRef(false)
  const didOpenLaunchFile = useRef(false)
  const lastRecordedRecentPathRef = useRef<string | null | undefined>(undefined)
  const preferencesRef = useRef<HTMLDivElement>(null)
  const documentStageRef = useRef<HTMLElement>(null)
  const previousActiveTabIdRef = useRef<DocumentTab['id'] | null>(null)
  const documentViewStatesRef = useRef<Record<DocumentTab['id'], DocumentViewState>>({})
  const outlineToggleRef = useRef<HTMLButtonElement>(null)
  const [outlineDrawerMount, setOutlineDrawerMount] = useState<HTMLElement | null>(null)
  const [contextualOverlayMount, setContextualOverlayMount] = useState<HTMLElement | null>(null)
  const closingTab = session.tabs.find((tab) => tab.id === session.closingTabId) ?? null
  const activeTabId = session.activeTabId
  const activeTab = activeTabId === null ? null : session.tabs.find((tab) => tab.id === activeTabId) ?? null
  const hasActiveDocument = activeTabId !== null
  const activePresentationMode = activeTabId === null ? 'edit' : presentationModes[activeTabId] ?? 'edit'
  const activeDocumentIsProtected = session.document.protectionReason !== null

  const saveDocumentScroll = useCallback((tabId: DocumentTab['id'], scrollTop: number, publish = false) => {
    const viewState = { scrollTop: Math.max(0, scrollTop) }
    documentViewStatesRef.current = {
      ...documentViewStatesRef.current,
      [tabId]: viewState,
    }
    if (!publish) return
    setDocumentViewStates((current) => (
      current[tabId]?.scrollTop === viewState.scrollTop
        ? current
        : { ...current, [tabId]: viewState }
    ))
  }, [])

  const selectTab = useCallback((tabId: DocumentTab['id']) => {
    const stage = documentStageRef.current
    const currentTabId = previousActiveTabIdRef.current ?? session.activeTabId
    if (stage && currentTabId !== null) saveDocumentScroll(currentTabId, stage.scrollTop, true)
    session.selectTab(tabId)
  }, [saveDocumentScroll, session])

  useEffect(() => {
    const documentStage = documentStageRef.current
    if (!documentStage) return
    const update = () => setOutlineLayout((current) => {
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
    if (outlineLayout !== 'inline') return
    setOutlineOpen((current) => Object.keys(current).length === 0 ? current : {})
  }, [outlineLayout])

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
    const previousScrollTop = documentViewStatesRef.current[previousTabId]?.scrollTop ?? stage.scrollTop
    saveDocumentScroll(previousTabId, previousScrollTop, true)

    const nextScrollTop = documentViewStatesRef.current[nextTabId]?.scrollTop
      ?? documentViewStates[nextTabId]?.scrollTop
      ?? 0
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
    if (isLoading || didRestoreStartupSession.current) return
    didRestoreStartupSession.current = true
    let disposed = false
    void restoreStartupSession(settings.startupSession).then(() => {
      if (!disposed) setStartupSessionRestored(true)
    })
    return () => { disposed = true }
  }, [isLoading, restoreStartupSession, settings.startupSession])

  useEffect(() => {
    if (!startupSessionRestored) return
    const openDocumentPaths = session.tabs.flatMap((tab) => tab.document.path ? [tab.document.path] : [])
    const activeDocumentPath = session.document.path
    const currentSession = settings.startupSession
    const samePaths = openDocumentPaths.length === currentSession.openDocumentPaths.length
      && openDocumentPaths.every((path, index) => path === currentSession.openDocumentPaths[index])
    if (activeDocumentPath === currentSession.activeDocumentPath && samePaths) return
    setStartupSession({ activeDocumentPath, openDocumentPaths })
  }, [session.activeTabId, session.document.path, session.tabs, setStartupSession, settings.startupSession, startupSessionRestored])

  useEffect(() => {
    if (!startupSessionRestored || didOpenLaunchFile.current) return
    didOpenLaunchFile.current = true
    void initialLaunchMarkdownFile().then((path) => {
      if (path) void openDocumentAtPath(path)
    })
  }, [openDocumentAtPath, startupSessionRestored])

  useEffect(() => {
    if (!settings.currentFolder) {
      setFolderTree(null)
      return
    }
    let disposed = false
    void browseMarkdownFolder(settings.currentFolder).then((tree) => {
      if (!disposed) {
        setFolderTree(tree)
        setFolderError(null)
      }
    }).catch((reason) => {
      if (!disposed) {
        setFolderError(reason instanceof Error && reason.message ? reason.message : copy.folderBrowseFailed)
        updateWorkspaceSettings({
          currentFolder: null,
          recentFolders: settings.recentFolders.filter((folder) => folder !== settings.currentFolder),
        })
      }
    })
    return () => { disposed = true }
  }, [copy.folderBrowseFailed, settings.currentFolder, settings.recentFolders, updateWorkspaceSettings])

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

  const clearRecent = () => updateWorkspaceSettings({
    ...workspaceSettings(settings),
    recentFiles: [],
    recentFolders: [],
  })

  const removeRecentFile = (path: string) => updateWorkspaceSettings({
    ...workspaceSettings(settings),
    recentFiles: settings.recentFiles.filter((file) => file !== path),
  })

  const removeRecentFolder = (path: string) => updateWorkspaceSettings({
    ...workspaceSettings(settings),
    recentFolders: settings.recentFolders.filter((folder) => folder !== path),
  })

  const chooseCurrentFolder = async () => {
    const folder = await pickMarkdownFolder()
    if (!folder) return
    setCurrentFolder(folder)
  }

  const setCurrentFolder = (folder: string) => {
    updateWorkspaceSettings({
      currentFolder: folder,
      recentFiles: settings.recentFiles,
      recentFolders: [folder, ...settings.recentFolders.filter((item) => item !== folder)].slice(0, 8),
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
      case 'new-document': session.createNewDocument(); break
      case 'open-document': void session.openDocument(); break
      case 'save-document': void session.saveDocument(); break
      case 'save-as': void session.saveAsDocument(); break
      case 'open-folder': void chooseCurrentFolder(); break
      case 'toggle-sidebar': updateWorkspaceSettings({ sidebarVisible: !settings.sidebarVisible }); break
      case 'toggle-focus-mode': setFocusMode((active) => !active); break
      case 'zoom-in': setDocumentZoom(settings.documentZoom + 10); break
      case 'zoom-out': setDocumentZoom(settings.documentZoom - 10); break
      case 'zoom-reset': setDocumentZoom(100); break
      case 'format-bold': document.execCommand('bold'); break
      case 'format-italic': document.execCommand('italic'); break
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
      if (event.key === 'Escape' && focusMode) setFocusMode(false)
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFocusMode((active) => !active)
      }
    }
    window.addEventListener('keydown', handleFocusShortcut)
    return () => window.removeEventListener('keydown', handleFocusShortcut)
  }, [focusMode])

  useEffect(() => {
    if (!preferencesOpen) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !preferencesRef.current?.contains(event.target)) {
        setPreferencesOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreferencesOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [preferencesOpen])

  useEffect(() => {
    const closeOutlineOnEscape = (event: KeyboardEvent) => {
      if (activeTabId === null || event.key !== 'Escape' || focusMode || outlineLayout !== 'drawer' || !outlineOpen[activeTabId]) return
      setOutlineOpen((current) => ({ ...current, [activeTabId]: false }))
      queueMicrotask(() => outlineToggleRef.current?.focus())
    }
    window.addEventListener('keydown', closeOutlineOnEscape)
    return () => window.removeEventListener('keydown', closeOutlineOnEscape)
  }, [activeTabId, focusMode, outlineLayout, outlineOpen])

  return (
    <main
      className={`app-shell${settings.sidebarVisible && !focusMode ? ' app-shell--with-sidebar' : ''}${focusMode ? ' app-shell--focus-mode' : ''}${outlineLayout === 'inline' ? ' app-shell--inline-outline' : ''}`}
      aria-label={copy.appLabel}
      data-appearance={settings.appearance}
      data-theme={colorScheme}
      data-color-scheme={colorScheme}
      lang={locale}
      style={appStyle}
    >
      <header className="application-bar window-bar">
        <nav className="tab-strip" aria-label={copy.openDocuments} role="tablist">
          {session.tabs.map((tab) => (
            <div key={tab.id} className={`document-tab${tab.id === session.activeTabId ? ' document-tab--active' : ''}`}>
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === session.activeTabId}
                aria-controls={`document-panel-${tab.id}`}
                onClick={() => selectTab(tab.id)}
              >
                <span className="document-tab__dirty" aria-hidden="true">{tab.document.isDirty ? '•' : ''}</span>
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
        <div className="window-bar__actions">
          <div className="application-bar__group application-bar__group--primary">
            <ModeSwitch
              disabled={!hasActiveDocument || activeDocumentIsProtected}
              editLabel={copy.edit}
              mode={activePresentationMode}
              readLabel={copy.read}
              onChange={(mode) => {
                if (activeTabId !== null) setPresentationModes((current) => ({ ...current, [activeTabId]: mode }))
              }}
            />
          </div>
          <div className="application-bar__group application-bar__group--layout">
            {activeTabId !== null && !focusMode && outlineLayout === 'drawer' && !activeDocumentIsProtected ? (
              <OutlineToggle buttonRef={outlineToggleRef} expanded={outlineOpen[activeTabId] ?? false} label={copy.editor.outline} onClick={() => setOutlineOpen((current) => ({ ...current, [activeTabId]: !current[activeTabId] }))} />
            ) : null}
            <IconButton
              aria-pressed={settings.sidebarVisible}
              label={settings.sidebarVisible ? copy.hideSidebar : copy.showSidebar}
              onClick={() => updateWorkspaceSettings({ ...workspaceSettings(settings), sidebarVisible: !settings.sidebarVisible })}
            >
              {settings.sidebarVisible ? <PanelLeftClose aria-hidden="true" size={16} strokeWidth={1.7} /> : <PanelLeftOpen aria-hidden="true" size={16} strokeWidth={1.7} />}
            </IconButton>
            <IconButton label={focusMode ? copy.exitFocusMode : copy.enterFocusMode} onClick={() => setFocusMode((active) => !active)}>
              <Focus aria-hidden="true" size={16} strokeWidth={1.7} />
            </IconButton>
          </div>
          <div className="application-bar__group application-bar__group--document">
            <IconButton label={copy.newDocument} onClick={session.createNewDocument}>
              <FilePlus2 aria-hidden="true" size={16} strokeWidth={1.7} />
            </IconButton>
            <IconButton label={copy.openDocument} onClick={() => void session.openDocument()}>
              <FolderOpen aria-hidden="true" size={16} strokeWidth={1.7} />
            </IconButton>
            <IconButton label={copy.openFolder} onClick={() => void chooseCurrentFolder()}>
              <FolderTree aria-hidden="true" size={16} strokeWidth={1.7} />
            </IconButton>
            <IconButton
              label={copy.saveDocument}
              disabled={!hasActiveDocument || session.activity !== 'idle' || session.document.protectionReason !== null}
              title={session.document.protectionReason ? copy.protectedSave : undefined}
              onClick={() => void session.saveDocument()}
            >
              <Save aria-hidden="true" size={16} strokeWidth={1.7} />
            </IconButton>
          </div>
          <div className="preferences-menu application-bar__group application-bar__group--settings" ref={preferencesRef}>
            <IconButton
              aria-expanded={preferencesOpen}
              aria-haspopup="dialog"
              label={copy.preferences}
              onClick={() => setPreferencesOpen((open) => !open)}
            >
              <Settings2 aria-hidden="true" size={16} strokeWidth={1.7} />
            </IconButton>
            {preferencesOpen ? (
              <section className="preferences-popover" aria-labelledby="preferences-title" role="dialog">
                <h2 id="preferences-title">{copy.preferences}</h2>
                <div className="preferences-popover__body">
                  <label>
                    <span>{copy.appearance}</span>
                    <select value={settings.appearance} onChange={(event) => setAppearance(event.target.value as typeof settings.appearance)}>
                      <option value="system">{copy.system}</option>
                      <option value="light">{copy.light}</option>
                      <option value="dark">{copy.dark}</option>
                      <option value="warm">{copy.warm}</option>
                    </select>
                  </label>
                  <label>
                    <span>{copy.language}</span>
                    <select value={settings.locale} onChange={(event) => setLocale(event.target.value as InterfaceLocale)}>
                      <option value="system">{copy.system}</option>
                      <option value="en">English</option>
                      <option value="zh-CN">简体中文</option>
                    </select>
                  </label>
                  <div className="preferences-popover__zoom">
                    <span>{copy.interfaceSize}</span>
                    <div>
                      <button type="button" aria-label={copy.decreaseInterfaceSize} onClick={() => setInterfaceZoom(settings.interfaceZoom - 10)}>
                        <Minus aria-hidden="true" size={13} strokeWidth={1.8} />
                      </button>
                      <output aria-label={copy.interfaceSize}>{settings.interfaceZoom}%</output>
                      <button type="button" aria-label={copy.increaseInterfaceSize} onClick={() => setInterfaceZoom(settings.interfaceZoom + 10)}>
                        <Plus aria-hidden="true" size={13} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                  <div className="preferences-popover__zoom">
                    <span>{copy.zoom}</span>
                    <div>
                      <button type="button" aria-label={copy.decreaseZoom} onClick={() => setDocumentZoom(settings.documentZoom - 10)}>
                        <Minus aria-hidden="true" size={13} strokeWidth={1.8} />
                      </button>
                      <output aria-label={copy.zoom}>{settings.documentZoom}%</output>
                      <button type="button" aria-label={copy.increaseZoom} onClick={() => setDocumentZoom(settings.documentZoom + 10)}>
                        <Plus aria-hidden="true" size={13} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                </div>
                <span className="preferences-popover__shortcut">⌘+ · ⌘− · ⌘0</span>
                {settingsError ? <span className="preferences-popover__error">{settingsError}</span> : null}
              </section>
            ) : null}
          </div>
        </div>
      </header>
      <section className="app-workspace">
        {settings.sidebarVisible ? (
          <FileSidebar
            copy={copy.sidebar}
            folder={settings.currentFolder}
            activeFile={session.document.path}
            tree={folderTree}
            width={settings.sidebarWidth}
            onChooseFolder={() => void chooseCurrentFolder()}
            onClearRecent={clearRecent}
            onOpenFile={(path) => void openSidebarFile(path)}
            onOpenFolder={setCurrentFolder}
            onRemoveRecentFile={removeRecentFile}
            onRemoveRecentFolder={removeRecentFolder}
            onWidthChange={(sidebarWidth) => updateWorkspaceSettings({ ...workspaceSettings(settings), sidebarWidth })}
            recentFiles={settings.recentFiles}
            recentFolders={settings.recentFolders}
          />
        ) : null}
        {folderError ? <div className="folder-error" role="status">{folderError}</div> : null}
        <section className={`document-area${activeTab ? '' : ' document-area--empty'}`} aria-label={copy.currentDocument}>
          {activeTabId !== null && activeTab ? (
            <DocumentContext
              copy={copy}
              document={activeTab.document}
              folder={settings.currentFolder}
              tab={activeTab}
            />
          ) : null}
          <section className="document-stage" ref={documentStageRef}>
            {session.tabs.map((tab) => (
              <DocumentPanel
                key={tab.id}
                tab={tab}
                copy={copy}
                title={displayDocumentTitle(tab, copy)}
                active={tab.id === session.activeTabId}
                outlineLayout={outlineLayout}
                outlineOpen={!focusMode && outlineLayout === 'drawer' && (outlineOpen[tab.id] ?? false)}
                presentationMode={presentationModes[tab.id] ?? 'edit'}
                onMarkdownChange={(markdown) => session.updateMarkdown({
                  tabId: tab.id,
                  documentId: tab.document.id,
                  path: tab.document.path,
                }, markdown)}
                onPasteImage={(image) => session.pasteImage(image, {
                  tabId: tab.id,
                  documentId: tab.document.id,
                  path: tab.document.path,
                })}
                onReload={() => void session.reloadExternalChange(tab.id)}
                onRetain={() => session.retainLocalChanges(tab.id)}
                onOverwrite={() => void session.overwriteExternalChange(tab.id)}
                onSaveAs={() => void session.saveAsDocument(tab.id)}
                onRetry={() => void session.retrySave(tab.id)}
                onCloseOutline={() => {
                  setOutlineOpen((current) => ({ ...current, [tab.id]: false }))
                  queueMicrotask(() => outlineToggleRef.current?.focus())
                }}
                outlineDrawerMount={outlineDrawerMount}
                contextualOverlayMount={contextualOverlayMount}
              />
            ))}
          </section>
        </section>
      </section>
      {/* Drawer content must live outside the scrolling document stage.  WebKit
          otherwise keeps it in the accessibility tree but can clip its fixed
          layer behind the editor's scroll surface. */}
      <div ref={setOutlineDrawerMount} className="outline-drawer-layer" />
      <div ref={setContextualOverlayMount} className="contextual-overlay-layer" />
      {closingTab ? (
        <section className="close-confirmation" role="alertdialog" aria-labelledby="close-confirmation-title">
          <strong id="close-confirmation-title">{copy.closeConfirmation(displayDocumentTitle(closingTab, copy))}</strong>
          <span>
            {closingTab.saveError
              ? copy.lastSaveFailed
              : copy.unsavedChanges}
          </span>
          <div className="close-confirmation__actions">
            <button type="button" onClick={session.discardAndCloseTab}>{copy.discardChanges}</button>
            <button type="button" onClick={() => void session.saveAndCloseTab()}>{copy.saveAndClose}</button>
            <button type="button" onClick={session.cancelCloseTab}>{copy.keepEditing}</button>
          </div>
        </section>
      ) : null}
    </main>
  )
}

function workspaceSettings(settings: import('../settings/applicationSettings').ApplicationSettings) {
  return {
    currentFolder: settings.currentFolder,
    recentFiles: settings.recentFiles,
    recentFolders: settings.recentFolders,
    sidebarVisible: settings.sidebarVisible,
    sidebarWidth: settings.sidebarWidth,
  }
}

function resolveLocale(locale: InterfaceLocale): 'en' | 'zh-CN' {
  const systemLocale = navigator.languages[0] ?? navigator.language
  return locale === 'system'
    ? systemLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
    : locale
}

function interfaceCopy(locale: 'en' | 'zh-CN') {
  return locale === 'zh-CN'
    ? {
        appLabel: 'Milo Markdown 编辑器', appearance: '外观', dark: '深色', decreaseInterfaceSize: '缩小界面字体', decreaseZoom: '缩小正文字体', increaseInterfaceSize: '放大界面字体', increaseZoom: '放大正文字体', interfaceSize: '界面字号', warm: '米色',
        closeConfirmation: (title: string) => `关闭“${title}”？`, closeDocument: (title: string) => `关闭 ${title}`,
        currentDocument: '当前文档', discardChanges: '放弃更改', externalChange: '外部更改',
        externalChangesDetected: '检测到外部更改', folderBrowseFailed: '无法读取这个文件夹。',
        edit: '编辑', read: '阅读', enterFocusMode: '进入专注模式', exitFocusMode: '退出专注模式', hideSidebar: '隐藏侧边栏', showSidebar: '显示侧边栏', openFolder: '打开文件夹',
        keepEditing: '继续编辑', lastSaveFailed: '上次保存失败。请保持文档打开、另存为，或放弃内存中的更改。', notSaved: '尚未保存',
        language: '语言', light: '浅色', newDocument: '新建文档', openDocument: '打开文档',
        openDocuments: '打开的文档', overwriteExternal: '覆盖外部版本', preferences: '偏好设置',
        protectedDocument: '受保护的文档', protectedDocumentDescription: '为保护此文件，已设为只读', protectedSave: '受保护的文档无法在 Milo 中保存',
        protectionReason: (reason: string) => reason ? '此文档包含原始 HTML，Milo 暂时无法在所见即所得模式中安全保留这部分内容。' : '',
        reloadFile: '重新载入文件', retainLocal: '保留本地更改', saveAndClose: '保存并关闭',
        saveAs: '另存为', saveDocument: '保存文档', saveFailed: '保存失败', saved: '已保存',
        saving: '正在保存', savingSoon: '即将保存', system: '跟随系统', tryAgain: '重试',
        unsavedChanges: '此文档有未保存的更改。', unsavedStatus: '未保存的更改', untitled: '未命名',
        pausedSaving: 'Milo 已暂停保存，避免本地编辑覆盖文件。', retainedSaving: '保留本地编辑期间，自动保存已暂停。',
        zoom: '正文字号',
        editorLabel: (title: string) => `${title} Markdown 文档`,
        sidebar: {
          changeFolder: '更换', chooseFolder: '选择文件夹', clearRecent: '清空', currentFolder: '当前文件夹', empty: '打开一个文件夹，在这里浏览 Markdown 文件。', emptyFolder: '还没有选择文件夹',
          files: '文件', recent: '最近使用', recentLabel: '最近使用的文件和文件夹', removeRecent: (name: string) => `从最近使用中移除 ${name}`,
        },
        editor: {
          apply: '应用', blockquote: '引用', bold: '粗体', bulletList: '项目符号列表', cancel: '取消', codeBlock: '代码块',
          copy: '复制', cut: '剪切', deleteBlock: '删除块', divider: '分隔线', formattingToolbar: '格式工具栏', heading1: '一级标题', heading2: '二级标题', heading3: '三级标题', closeOutline: '关闭大纲',
          heading4: '四级标题', heading5: '五级标题', heading6: '六级标题', moreHeadings: '更多标题',
          inlineCode: '行内代码', italic: '斜体', link: '链接', linkAddress: '链接地址', linkText: '链接文本', insert: '插入', addBlock: '添加块', addLink: '添加链接…', editLink: '编辑链接…', insertLink: '插入链接…', orderedList: '编号列表', paragraph: '正文',
          paste: '粘贴', selectAll: '全选', strike: '删除线', table: '表格', textStyle: '文本样式',
          addColumnLeft: '在左侧添加列', addColumnRight: '在右侧添加列', addRowAbove: '在上方添加行', addRowBelow: '在下方添加行',
          codeBlockLanguage: '代码块语言', deleteColumn: '删除列', deleteRow: '删除行', loadImage: '加载图片',
          loadImageError: '图片加载失败，点击重试', loadRemoteImage: (alt: string) => `加载远程图片${alt ? `：${alt}` : ''}`,
          loadingImage: '正在加载图片…', noOutline: '添加标题后会显示在这里。', outline: '大纲', plainText: '纯文本', startWriting: '从一个想法开始…',
          removeLink: '移除链接',
          startWritingHint: '直接输入即可，Milo 会自动处理 Markdown 格式。',
        },
      }
    : {
        appLabel: 'Milo Markdown editor', appearance: 'Appearance', dark: 'Dark', decreaseInterfaceSize: 'Decrease interface size', decreaseZoom: 'Decrease document size', increaseInterfaceSize: 'Increase interface size', increaseZoom: 'Increase document size', interfaceSize: 'Interface size', warm: 'Warm',
        closeConfirmation: (title: string) => `Close “${title}”?`, closeDocument: (title: string) => `Close ${title}`,
        currentDocument: 'Current document', discardChanges: 'Discard changes', externalChange: 'External change',
        externalChangesDetected: 'External changes detected', folderBrowseFailed: 'Could not browse this folder.',
        edit: 'Edit', read: 'Read', enterFocusMode: 'Enter focus mode', exitFocusMode: 'Exit focus mode', hideSidebar: 'Hide sidebar', showSidebar: 'Show sidebar', openFolder: 'Open folder',
        keepEditing: 'Keep editing', lastSaveFailed: 'The last save failed. Keep the document open, save it elsewhere, or discard the in-memory changes.', notSaved: 'Not saved',
        language: 'Language', light: 'Light', newDocument: 'New document', openDocument: 'Open document',
        openDocuments: 'Open documents', overwriteExternal: 'Overwrite external version', preferences: 'Preferences',
        protectedDocument: 'Protected Markdown document', protectedDocumentDescription: 'Read-only to protect this file', protectedSave: 'Protected documents cannot be saved from Milo',
        protectionReason: (reason: string) => reason,
        reloadFile: 'Reload file', retainLocal: 'Keep local edits', saveAndClose: 'Save and close',
        saveAs: 'Save As', saveDocument: 'Save document', saveFailed: 'Save failed', saved: 'Saved',
        saving: 'Saving', savingSoon: 'Saving soon', system: 'System', tryAgain: 'Try again',
        unsavedChanges: 'This document has unsaved changes.', unsavedStatus: 'Unsaved changes', untitled: 'Untitled',
        pausedSaving: 'Milo paused saving so your local edits cannot overwrite the file.', retainedSaving: 'Automatic saving is paused while you keep your local edits.',
        zoom: 'Document size',
        editorLabel: (title: string) => `${title} Markdown document`,
        sidebar: {
          changeFolder: 'Change', chooseFolder: 'Choose folder', clearRecent: 'Clear', currentFolder: 'Current folder', empty: 'Open a folder to browse Markdown files here.', emptyFolder: 'No folder selected',
          files: 'Files', recent: 'Recent', recentLabel: 'Recent files and folders', removeRecent: (name: string) => `Remove ${name} from recent`,
        },
        editor: {
          apply: 'Apply', blockquote: 'Quote', bold: 'Bold', bulletList: 'Bulleted list', cancel: 'Cancel', codeBlock: 'Code block',
          copy: 'Copy', cut: 'Cut', deleteBlock: 'Delete block', divider: 'Divider', formattingToolbar: 'Formatting toolbar', heading1: 'Heading 1', heading2: 'Heading 2', heading3: 'Heading 3', closeOutline: 'Close outline',
          heading4: 'Heading 4', heading5: 'Heading 5', heading6: 'Heading 6', moreHeadings: 'More Headings',
          inlineCode: 'Inline code', italic: 'Italic', link: 'Link', linkAddress: 'Link address', linkText: 'Link text', insert: 'Insert', addBlock: 'Add block', addLink: 'Add link…', editLink: 'Edit link…', insertLink: 'Insert link…', orderedList: 'Numbered list', paragraph: 'Body text',
          paste: 'Paste', selectAll: 'Select all', strike: 'Strikethrough', table: 'Table', textStyle: 'Text style',
          addColumnLeft: 'Add column left', addColumnRight: 'Add column right', addRowAbove: 'Add row above', addRowBelow: 'Add row below',
          codeBlockLanguage: 'Code block language', deleteColumn: 'Delete column', deleteRow: 'Delete row', loadImage: 'Load image',
          loadImageError: 'Could not load image — try again', loadRemoteImage: (alt: string) => `Load remote image${alt ? `: ${alt}` : ''}`,
          loadingImage: 'Loading image…', noOutline: 'Headings will appear here.', outline: 'Outline', plainText: 'Plain text', startWriting: 'Start with a thought…',
          removeLink: 'Remove link',
          startWritingHint: 'Just type — Milo keeps the Markdown for you.',
        },
      }
}

function displayDocumentTitle(tab: Pick<DocumentTab, 'document'>, copy: ReturnType<typeof interfaceCopy>): string {
  return tab.document.path ? tab.document.title : copy.untitled
}

function DocumentContext({ copy, document, folder, tab }: { copy: ReturnType<typeof interfaceCopy>; document: DocumentTab['document']; folder: string | null; tab: DocumentTab }) {
  const title = displayDocumentTitle({ document }, copy)
  const workspace = folder ? fileName(folder) : null
  const status = tab.saveFeedback === 'pending'
    ? copy.savingSoon
    : tab.saveFeedback === 'saving'
      ? copy.saving
      : tab.saveFeedback === 'saved'
        ? copy.saved
        : documentStatus(tab, copy)

  return (
    <div className="document-context" aria-live="polite">
      <div className="document-context__identity">
        <span className="document-context__icon" aria-hidden="true"><FileText size={15} strokeWidth={1.7} /></span>
        <span className="document-context__path">
          {workspace ? <><span className="document-context__workspace">{workspace}</span><span className="document-context__separator" aria-hidden="true">/</span></> : null}
          <strong title={title}>{title}</strong>
        </span>
      </div>
      <div className="document-context__status">
        <span className={`document-context__status-dot document-context__status-dot--${statusTone(tab)}`} aria-hidden="true" />
        <span>{status}</span>
      </div>
    </div>
  )
}

function statusTone(tab: DocumentTab): 'saved' | 'dirty' | 'error' {
  if (tab.saveError || tab.error || tab.externalChange || tab.document.protectionReason) return 'error'
  if (tab.document.isDirty || tab.activity === 'saving' || tab.activity === 'opening') return 'dirty'
  return 'saved'
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

type DocumentPanelProps = {
  active: boolean
  copy: ReturnType<typeof interfaceCopy>
  onMarkdownChange: (markdown: string) => void
  onPasteImage: (image: import('../file-system/nativeMarkdownFile').PastedImage) => Promise<string | null>
  onOverwrite: () => void
  onReload: () => void
  onRetain: () => void
  onRetry: () => void
  onSaveAs: () => void
  onCloseOutline: () => void
  outlineDrawerMount: HTMLElement | null
  contextualOverlayMount: HTMLElement | null
  outlineLayout: 'inline' | 'drawer'
  outlineOpen: boolean
  presentationMode: PresentationMode
  tab: DocumentTab
  title: string
}

function DocumentPanel({
  active,
  copy,
  onMarkdownChange,
  onPasteImage,
  onOverwrite,
  onReload,
  onRetain,
  onRetry,
  onSaveAs,
  onCloseOutline,
  outlineDrawerMount,
  contextualOverlayMount,
  outlineLayout,
  outlineOpen,
  presentationMode,
  tab,
  title,
}: DocumentPanelProps) {
  const { document, error, saveError, externalChange, notice } = tab
  const actionableError = saveError ?? error
  const isProtected = document.protectionReason !== null

  return (
    <section
      id={`document-panel-${tab.id}`}
      className="document-panel"
      role="tabpanel"
      aria-label={title}
      hidden={!active}
    >
      {isProtected ? (
        <section className="protected-document" aria-label={copy.protectedDocument}>
          <div className="protected-document__notice" role="alert">
            <strong>{copy.protectedDocumentDescription}</strong>
            <span>{copy.protectionReason(document.protectionReason ?? '')}</span>
          </div>
          <pre className="protected-document__source">{`${document.frontMatter}${document.markdown}`}</pre>
        </section>
      ) : (
        <DocumentEditorWorkspace
          active={active}
          ariaLabel={copy.editorLabel(title)}
          copy={copy.editor}
          editorId={String(tab.id)}
          document={document}
          documentPath={document.path}
          onCloseOutline={onCloseOutline}
          onMarkdownChange={onMarkdownChange}
          onPasteImage={onPasteImage}
          outlineDrawerMount={outlineDrawerMount}
          contextualOverlayMount={contextualOverlayMount}
          outlineLayout={outlineLayout}
          outlineOpen={active && outlineOpen}
          placeholder={copy.editor.startWriting}
          presentationMode={presentationMode}
        />
      )}
      {notice ? <div className="document-notice" role="status">{notice}</div> : null}
      {externalChange ? (
        <div className="document-conflict" role="alert">
          <strong>{copy.externalChangesDetected}</strong>
          <span>
            {externalChange === 'pending'
              ? copy.pausedSaving
              : copy.retainedSaving}
          </span>
          <div className="document-conflict__actions">
            <button type="button" onClick={onReload}>{copy.reloadFile}</button>
            {externalChange === 'pending' ? (
              <button type="button" onClick={onRetain}>{copy.retainLocal}</button>
            ) : (
              <button type="button" onClick={onOverwrite}>{copy.overwriteExternal}</button>
            )}
            <button type="button" onClick={onSaveAs}>{copy.saveAs}</button>
          </div>
        </div>
      ) : null}
      {actionableError ? (
        <div className="document-error" role="alert">
          <span>{actionableError}</span>
          <button type="button" onClick={onRetry}>{copy.tryAgain}</button>
          <button type="button" onClick={onSaveAs}>{copy.saveAs}</button>
        </div>
      ) : null}
    </section>
  )
}

type DocumentEditorWorkspaceProps = {
  active: boolean
  ariaLabel: string
  copy: ReturnType<typeof interfaceCopy>['editor']
  document: DocumentTab['document']
  documentPath: string | null
  editorId: string
  onCloseOutline: () => void
  onMarkdownChange: (markdown: string) => void
  onPasteImage: (image: import('../file-system/nativeMarkdownFile').PastedImage) => Promise<string | null>
  outlineDrawerMount: HTMLElement | null
  contextualOverlayMount: HTMLElement | null
  outlineLayout: 'inline' | 'drawer'
  outlineOpen: boolean
  placeholder: string
  presentationMode: PresentationMode
}

function DocumentEditorWorkspace({ active, ariaLabel, copy, document, documentPath, editorId, onCloseOutline, onMarkdownChange, onPasteImage, outlineDrawerMount, contextualOverlayMount, outlineLayout, outlineOpen, placeholder, presentationMode }: DocumentEditorWorkspaceProps) {
  const [inlineOutlineMount, setInlineOutlineMount] = useState<HTMLElement | null>(null)
  const outlineMount = outlineLayout === 'inline' ? inlineOutlineMount : outlineDrawerMount

  return (
    <div className={`document-editor-workspace document-editor-workspace--${outlineLayout}`}>
      <MilkdownEditor
        key={`${document.id}:${document.editorVersion}`}
        active={active}
        ariaLabel={ariaLabel}
        copy={copy}
        documentPath={documentPath}
        editorId={editorId}
        initialMarkdown={document.markdown}
        onCloseOutline={onCloseOutline}
        onMarkdownChange={onMarkdownChange}
        onPasteImage={onPasteImage}
        contextualOverlayMount={contextualOverlayMount}
        outlineLayout={outlineLayout}
        outlineMount={outlineMount}
        outlineOpen={outlineOpen}
        placeholder={placeholder}
        presentationMode={presentationMode}
      />
      <div ref={setInlineOutlineMount} className="document-editor-workspace__outline" />
    </div>
  )
}

function documentStatus(tab: DocumentTab, copy: ReturnType<typeof interfaceCopy>): string {
  if (tab.externalChange) return copy.externalChange
  if (tab.document.protectionReason) return copy.protectedDocument
  if (tab.saveError || tab.error) return copy.saveFailed
  if (tab.activity === 'opening') return `${copy.openDocument}…`
  if (tab.activity === 'saving') return `${copy.saving}…`
  if (tab.document.isDirty) return copy.unsavedStatus
  return tab.document.path ? copy.saved : copy.notSaved
}

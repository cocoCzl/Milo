import {
  ChevronRight,
  Eraser,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  Settings2,
  X,
} from 'lucide-react'
import {
  useId,
  useRef,
  useState,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { ActionMenu } from './ActionMenu'
import { IconButton } from './IconButton'
import { browseMarkdownFolder, type MarkdownTreeNode } from '../file-system/nativeMarkdownFile'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '../settings/applicationSettings'

type FileSidebarProps = {
  activeFile: string | null
  copy: {
    changeFolder: string
    chooseFolder: string
    currentFolder: string
    empty: string
    emptyDirectory: string
    showExcluded: string
    folderActions: string
    filterDescription: string
    refreshDirectory: (name: string) => string
    loadMore: string
    retry: string
    refresh?: string
    loadingFolder: string
    folderWidth: string
    emptyRecent: string
    clearRecent: string
    clearRecentHint: string
    recent: string
    recentLabel: string
    removeRecent: (name: string) => string
    settings: string
    workspace: string
  }
  folder: string | null
  folderError?: string | null
  onRetryFolder?: () => void
  onChooseFolder: () => void
  onClearRecent: () => void
  onOpenFile: (path: string) => void
  onOpenFolder: (path: string) => void
  onOpenPreferences: () => void
  onRemoveRecentFile: (path: string) => void
  onRemoveRecentFolder: (path: string) => void
  onWidthChange: (width: number) => void
  recentFiles: string[]
  recentFolders: string[]
  tree: MarkdownTreeNode | null
  width: number
}

export function FileSidebar({
  activeFile,
  copy,
  folder,
  folderError = null,
  onChooseFolder,
  onRetryFolder,
  onClearRecent,
  onOpenFile,
  onOpenFolder,
  onOpenPreferences,
  onRemoveRecentFile,
  onRemoveRecentFolder,
  onWidthChange,
  recentFiles,
  recentFolders,
  tree,
  width,
}: FileSidebarProps) {
  const [showExcluded, setShowExcluded] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const sidebarRef = useRef<HTMLElement>(null)
  const recentSummaryRef = useRef<HTMLElement>(null)

  const commitVisualWidth = (nextWidth: number) => {
    const clampedWidth = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, Math.round(nextWidth)),
    )
    sidebarRef.current?.style.setProperty('width', `${clampedWidth}px`)
    document
      .querySelector<HTMLElement>('.app-shell')
      ?.style.setProperty('--sidebar-width', `${clampedWidth}px`)
    return clampedWidth
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()

    const measuredWidth = sidebarRef.current?.getBoundingClientRect().width ?? 0
    const initialWidth = measuredWidth > 0 ? measuredWidth : width
    const initialX = event.clientX
    let nextWidth = initialWidth

    const applyWidth = (clientX: number) => {
      nextWidth = commitVisualWidth(initialWidth + clientX - initialX)
    }
    const onPointerMove = (moveEvent: PointerEvent) => applyWidth(moveEvent.clientX)
    const stopResize = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopResize)
      onWidthChange(nextWidth)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopResize)
  }

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    const nextWidth = commitVisualWidth(width + direction * (event.shiftKey ? 32 : 8))
    onWidthChange(nextWidth)
  }

  return (
    <aside
      ref={sidebarRef}
      className="file-sidebar"
      aria-label={copy.currentFolder}
      style={{ width }}
    >
      <header className="file-sidebar__brand">
        <span className="file-sidebar__brand-mark" aria-hidden="true">
          M
        </span>
        <span className="file-sidebar__brand-copy">
          <strong>Milo</strong>
        </span>
      </header>
      <div className="file-sidebar__body">
        <section
          className="file-sidebar__section file-sidebar__workspace"
          aria-label={copy.workspace}
        >
          <header className="file-sidebar__section-header">
            <span>{copy.workspace}</span>
          </header>
          {folder ? (
            <div className="file-sidebar__workspace-row">
              <span className="file-sidebar__workspace-icon" aria-hidden="true">
                <FolderOpen size={14} strokeWidth={1.8} />
              </span>
              <strong title={folder}>{fileName(folder)}</strong>
              <div className="file-sidebar__folder-actions">
                <IconButton
                  label={copy.refresh ?? 'Refresh folder'}
                  onClick={() => {
                    if (tree?.path === folder) setRefreshVersion((version) => version + 1)
                    else onRetryFolder?.()
                  }}
                >
                  <RefreshCw aria-hidden="true" size={15} />
                </IconButton>
                <ActionMenu
                  label={copy.folderActions}
                  actions={[
                    {
                      label: copy.changeFolder,
                      icon: <FolderOpen aria-hidden="true" size={15} />,
                      onSelect: onChooseFolder,
                    },
                    {
                      label: copy.showExcluded,
                      checked: showExcluded,
                      description: copy.filterDescription,
                      separatorBefore: true,
                      onSelect: () => setShowExcluded((value) => !value),
                    },
                  ]}
                />
              </div>
            </div>
          ) : null}
          {folderError ? (
            <p className="file-sidebar__empty-note" role="status">
              {folderError}
              {onRetryFolder ? (
                <button className="action-button" type="button" onClick={onRetryFolder}>
                  {copy.retry}
                </button>
              ) : null}
            </p>
          ) : !folder ? (
            <div className="file-sidebar__empty">
              <p>{copy.empty}</p>
              <button type="button" onClick={onChooseFolder}>
                <FolderOpen aria-hidden="true" size={14} strokeWidth={1.7} />
                {copy.chooseFolder}
              </button>
            </div>
          ) : tree?.path === folder ? (
            <div className="file-sidebar__tree">
              <DirectoryListing
                key={folder}
                copy={copy}
                node={tree}
                activeFile={activeFile}
                depth={0}
                onOpenFile={onOpenFile}
                showExcluded={showExcluded}
                refreshVersion={refreshVersion}
                reload={showExcluded}
              />
            </div>
          ) : (
            <p className="file-sidebar__empty-note" role="status">
              {copy.loadingFolder}
            </p>
          )}
        </section>
        <section
          className="file-sidebar__section file-sidebar__recent"
          aria-label={copy.recentLabel}
        >
          <div className="file-sidebar__recent-header">
            <details open={!folder}>
              <summary ref={recentSummaryRef} className="file-sidebar__section-header">
                <ChevronRight aria-hidden="true" size={13} />
                <span>{copy.recent}</span>
              </summary>
              {recentFiles.length === 0 && recentFolders.length === 0 ? (
                <p className="file-sidebar__empty-note">{copy.emptyRecent}</p>
              ) : null}
              {recentFiles.map((path) => (
                <div className="file-sidebar__recent-item" key={path}>
                  <button
                    aria-current={path === activeFile ? 'page' : undefined}
                    className="file-sidebar__recent-open"
                    title={path}
                    type="button"
                    onClick={() => onOpenFile(path)}
                  >
                    <FileText aria-hidden="true" size={14} strokeWidth={1.6} />
                    <span>{fileName(path)}</span>
                  </button>
                  <button
                    aria-label={copy.removeRecent(fileName(path))}
                    className="file-sidebar__recent-remove"
                    title={copy.removeRecent(fileName(path))}
                    type="button"
                    onClick={() => onRemoveRecentFile(path)}
                  >
                    <X aria-hidden="true" size={12} strokeWidth={1.8} />
                  </button>
                </div>
              ))}
              {recentFolders.map((path) => (
                <div className="file-sidebar__recent-item" key={path}>
                  <button
                    className="file-sidebar__recent-open"
                    title={path}
                    type="button"
                    onClick={() => onOpenFolder(path)}
                  >
                    <Folder aria-hidden="true" size={14} strokeWidth={1.6} />
                    <span>{fileName(path)}</span>
                  </button>
                  <button
                    aria-label={copy.removeRecent(fileName(path))}
                    className="file-sidebar__recent-remove"
                    title={copy.removeRecent(fileName(path))}
                    type="button"
                    onClick={() => onRemoveRecentFolder(path)}
                  >
                    <X aria-hidden="true" size={12} strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </details>
            {recentFiles.length > 0 || recentFolders.length > 0 ? (
              <div className="file-sidebar__clear-recent">
                <IconButton
                  label={copy.clearRecent}
                  title={`${copy.clearRecent} · ${copy.clearRecentHint}`}
                  onClick={() => {
                    onClearRecent()
                    recentSummaryRef.current?.focus()
                  }}
                >
                  <Eraser aria-hidden="true" size={15} />
                </IconButton>
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <footer className="file-sidebar__footer">
        <button className="action-button" type="button" onClick={onOpenPreferences}>
          <Settings2 aria-hidden="true" size={15} strokeWidth={1.7} />
          <span>{copy.settings}</span>
        </button>
      </footer>
      <div
        aria-label={copy.folderWidth}
        aria-orientation="vertical"
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuenow={width}
        className="file-sidebar__resize-handle"
        role="separator"
        tabIndex={0}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
      />
    </aside>
  )
}

function fileName(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path
}

type TreeProps = {
  copy: Pick<
    FileSidebarProps['copy'],
    'loadMore' | 'retry' | 'refresh' | 'refreshDirectory' | 'loadingFolder' | 'emptyDirectory'
  >
  activeFile: string | null
  depth: number
  node: MarkdownTreeNode
  onOpenFile: (path: string) => void
  showExcluded: boolean
}

function DirectoryListing({
  copy,
  node,
  activeFile,
  depth,
  onOpenFile,
  showExcluded,
  reload = false,
  refreshVersion = 0,
}: TreeProps & { reload?: boolean; refreshVersion?: number }) {
  const [page, setPage] = useState(node)
  const [retryVersion, setRetryVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const failedPage = useRef<number | null>(null)
  const generation = useRef({ value: 0 })
  const previousFilter = useRef(showExcluded)
  useEffect(() => {
    const lifetime = generation.current
    const request = ++lifetime.value
    const filterChanged = previousFilter.current !== showExcluded
    previousFilter.current = showExcluded
    setError(null)
    failedPage.current = null
    if (reload || refreshVersion || retryVersion || filterChanged) {
      setLoading(true)
      void browseMarkdownFolder(
        node.path,
        showExcluded,
        ...(refreshVersion || retryVersion || filterChanged ? [0] : []),
      )
        .then((result) => {
          if (lifetime.value === request) setPage(result)
        })
        .catch((reason) => {
          if (lifetime.value === request) setError(String(reason))
        })
        .finally(() => {
          if (lifetime.value === request) setLoading(false)
        })
    } else {
      setPage(node)
      setLoading(false)
    }
    return () => {
      lifetime.value++
    }
  }, [node, reload, showExcluded, refreshVersion, retryVersion])
  const more = async (offset = page.nextOffset ?? 0) => {
    if (loading) return
    const request = ++generation.current.value
    setLoading(true)
    setError(null)
    failedPage.current = null
    try {
      const result = await browseMarkdownFolder(node.path, showExcluded, offset)
      if (generation.current.value === request)
        setPage((current) => ({
          ...result,
          children: [
            ...current.children,
            ...result.children.filter(
              (child) => !current.children.some((existing) => existing.path === child.path),
            ),
          ],
        }))
    } catch (reason) {
      if (generation.current.value === request) {
        failedPage.current = offset
        setError(String(reason))
      }
    } finally {
      if (generation.current.value === request) setLoading(false)
    }
  }
  return (
    <div className="file-sidebar__listing" aria-busy={loading}>
      {page.children.map((child) => (
        <TreeBranch
          copy={copy}
          key={child.path}
          node={child}
          activeFile={activeFile}
          depth={depth}
          onOpenFile={onOpenFile}
          showExcluded={showExcluded}
        />
      ))}
      {loading ? (
        <p className="file-sidebar__empty-note" role="status">
          {copy.loadingFolder}
        </p>
      ) : null}
      {!loading && !error && page.children.length === 0 ? (
        <p className="file-sidebar__empty-note">{copy.emptyDirectory}</p>
      ) : null}
      {error ? (
        <div className="file-sidebar__load-error" role="alert">
          <span>{error}</span>
          <button
            className="action-button"
            type="button"
            onClick={() => {
              if (failedPage.current !== null) {
                void more(failedPage.current)
                return
              }
              generation.current.value++
              setRetryVersion((version) => version + 1)
            }}
          >
            {copy.retry}
          </button>
        </div>
      ) : null}
      {page.nextOffset != null && !error ? (
        <button
          className="file-sidebar__load-more action-button"
          type="button"
          onClick={() => void more()}
          disabled={loading}
        >
          {copy.loadMore}
        </button>
      ) : null}
    </div>
  )
}

function TreeBranch({ copy, activeFile, node, depth, onOpenFile, showExcluded }: TreeProps) {
  const [expanded, setExpanded] = useState(Boolean(activeFile?.startsWith(`${node.path}/`)))
  const [refreshVersion, setRefreshVersion] = useState(0)
  const id = useId()
  useEffect(() => {
    if (activeFile?.startsWith(`${node.path}/`)) setExpanded(true)
  }, [activeFile, node.path])
  if (!node.isDirectory)
    return (
      <button
        aria-current={node.path === activeFile ? 'page' : undefined}
        className="file-sidebar__file"
        title={node.path}
        type="button"
        style={{ paddingLeft: 25 + depth * 16 }}
        onClick={() => onOpenFile(node.path)}
      >
        <FileText aria-hidden="true" size={15} strokeWidth={1.6} />
        <span>{node.name}</span>
      </button>
    )
  return (
    <div className="file-sidebar__directory">
      <div className="file-sidebar__directory-row">
        <button
          className="file-sidebar__directory-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          title={node.path}
          type="button"
          style={{ paddingLeft: 7 + depth * 16 }}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight
            className="file-sidebar__chevron"
            aria-hidden="true"
            size={13}
            strokeWidth={1.8}
          />
          <Folder aria-hidden="true" size={15} strokeWidth={1.6} />
          <span>{node.name}</span>
        </button>
        <IconButton
          className="file-sidebar__directory-refresh"
          label={copy.refreshDirectory(node.name)}
          title={`${copy.refreshDirectory(node.name)} — ${node.path}`}
          onClick={() => {
            setExpanded(true)
            setRefreshVersion((version) => version + 1)
          }}
        >
          <RefreshCw aria-hidden="true" size={14} />
        </IconButton>
      </div>
      <div id={id} hidden={!expanded}>
        {expanded ? (
          <DirectoryListing
            copy={copy}
            node={node}
            activeFile={activeFile}
            depth={depth + 1}
            onOpenFile={onOpenFile}
            showExcluded={showExcluded}
            reload={node.children.length === 0}
            refreshVersion={refreshVersion}
          />
        ) : null}
      </div>
    </div>
  )
}

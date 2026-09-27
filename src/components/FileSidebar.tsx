import { ChevronRight, FileText, Folder, FolderOpen, Settings2, X } from 'lucide-react'
import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'

import type { MarkdownTreeNode } from '../file-system/nativeMarkdownFile'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '../settings/applicationSettings'

type FileSidebarProps = {
  activeFile: string | null
  copy: {
    changeFolder: string
    chooseFolder: string
    currentFolder: string
    empty: string
    emptyDirectory: string
    emptyFolder: string
    emptyRecent: string
    clearRecent: string
    recent: string
    recentLabel: string
    removeRecent: (name: string) => string
    settings: string
    workspace: string
  }
  folder: string | null
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

export function FileSidebar({ activeFile, copy, folder, onChooseFolder, onClearRecent, onOpenFile, onOpenFolder, onOpenPreferences, onRemoveRecentFile, onRemoveRecentFolder, onWidthChange, recentFiles, recentFolders, tree, width }: FileSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null)

  const commitVisualWidth = (nextWidth: number) => {
    const clampedWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(nextWidth)))
    sidebarRef.current?.style.setProperty('width', `${clampedWidth}px`)
    document.querySelector<HTMLElement>('.app-shell')?.style.setProperty('--sidebar-width', `${clampedWidth}px`)
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
        <span className="file-sidebar__brand-mark" aria-hidden="true">M</span>
        <span className="file-sidebar__brand-copy">
          <strong>Milo</strong>
          <span>Write a clearer tomorrow</span>
        </span>
      </header>
      <div className="file-sidebar__body">
        <section className="file-sidebar__section file-sidebar__recent" aria-label={copy.recentLabel}>
          <header className="file-sidebar__section-header">
            <span>{copy.recent}</span>
            {recentFiles.length > 0 || recentFolders.length > 0 ? <button type="button" onClick={onClearRecent}>{copy.clearRecent}</button> : null}
          </header>
          {recentFiles.length === 0 && recentFolders.length === 0 ? <p className="file-sidebar__empty-note">{copy.emptyRecent}</p> : null}
          {recentFiles.map((path) => (
            <div className="file-sidebar__recent-item" key={path}>
              <button aria-current={path === activeFile ? 'page' : undefined} className="file-sidebar__recent-open" title={path} type="button" onClick={() => onOpenFile(path)}>
                <FileText aria-hidden="true" size={14} strokeWidth={1.6} /><span>{fileName(path)}</span>
              </button>
              <button aria-label={copy.removeRecent(fileName(path))} className="file-sidebar__recent-remove" title={copy.removeRecent(fileName(path))} type="button" onClick={() => onRemoveRecentFile(path)}>
                <X aria-hidden="true" size={12} strokeWidth={1.8} />
              </button>
            </div>
          ))}
          {recentFolders.map((path) => (
            <div className="file-sidebar__recent-item" key={path}>
              <button className="file-sidebar__recent-open" title={path} type="button" onClick={() => onOpenFolder(path)}>
                <Folder aria-hidden="true" size={14} strokeWidth={1.6} /><span>{fileName(path)}</span>
              </button>
              <button aria-label={copy.removeRecent(fileName(path))} className="file-sidebar__recent-remove" title={copy.removeRecent(fileName(path))} type="button" onClick={() => onRemoveRecentFolder(path)}>
                <X aria-hidden="true" size={12} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </section>
        <section className="file-sidebar__section file-sidebar__workspace" aria-label={copy.workspace}>
          <header className="file-sidebar__section-header"><span>{copy.workspace}</span></header>
          <div className="file-sidebar__workspace-row">
            <span className="file-sidebar__workspace-icon" aria-hidden="true"><FolderOpen size={15} strokeWidth={1.8} /></span>
            <strong title={folder ?? undefined}>{folder ? fileName(folder) : copy.emptyFolder}</strong>
            <button aria-label={copy.changeFolder} title={copy.changeFolder} type="button" onClick={onChooseFolder}>{copy.changeFolder}</button>
          </div>
          {tree ? (
            <div className="file-sidebar__tree">
              {tree.children.length > 0
                ? tree.children.map((child) => <TreeBranch activeFile={activeFile} key={child.path} node={child} depth={0} onOpenFile={onOpenFile} />)
                : <p className="file-sidebar__empty-note">{copy.emptyDirectory}</p>}
            </div>
          ) : (
            <div className="file-sidebar__empty">
              <p>{copy.empty}</p>
              <button type="button" onClick={onChooseFolder}>
                <FolderOpen aria-hidden="true" size={14} strokeWidth={1.7} />
                {copy.chooseFolder}
              </button>
            </div>
          )}
        </section>
      </div>
      <footer className="file-sidebar__footer">
        <button type="button" onClick={onOpenPreferences}>
          <Settings2 aria-hidden="true" size={15} strokeWidth={1.7} />
          <span>{copy.settings}</span>
        </button>
      </footer>
      <div
        aria-label={`${copy.workspace} width`}
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

function TreeBranch({ activeFile, node, depth, onOpenFile }: { activeFile: string | null; depth: number; node: MarkdownTreeNode; onOpenFile: (path: string) => void }) {
  if (!node.isDirectory) {
    return (
      <button aria-current={node.path === activeFile ? 'page' : undefined} className="file-sidebar__file" title={node.path} type="button" style={{ paddingLeft: 14 + depth * 14 }} onClick={() => onOpenFile(node.path)}>
        <FileText aria-hidden="true" size={13} strokeWidth={1.6} />
        <span>{node.name}</span>
      </button>
    )
  }

  return (
    <details className="file-sidebar__directory" open>
      <summary title={node.path} style={{ paddingLeft: 10 + depth * 14 }}>
        <ChevronRight aria-hidden="true" size={12} strokeWidth={1.8} />
        <Folder aria-hidden="true" size={13} strokeWidth={1.6} />
        <span>{node.name}</span>
      </summary>
      {node.children.map((child) => <TreeBranch activeFile={activeFile} key={child.path} node={child} depth={depth + 1} onOpenFile={onOpenFile} />)}
    </details>
  )
}

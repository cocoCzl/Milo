import { ChevronRight, FileText, Folder, FolderOpen, X } from 'lucide-react'
import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

import type { MarkdownTreeNode } from '../file-system/nativeMarkdownFile'

type FileSidebarProps = {
  activeFile: string | null
  copy: {
    changeFolder: string
    chooseFolder: string
    currentFolder: string
    empty: string
    emptyFolder: string
    files: string
    clearRecent: string
    recent: string
    recentLabel: string
    removeRecent: (name: string) => string
  }
  folder: string | null
  onChooseFolder: () => void
  onClearRecent: () => void
  onOpenFile: (path: string) => void
  onOpenFolder: (path: string) => void
  onRemoveRecentFile: (path: string) => void
  onRemoveRecentFolder: (path: string) => void
  onWidthChange: (width: number) => void
  recentFiles: string[]
  recentFolders: string[]
  tree: MarkdownTreeNode | null
  width: number
}

export function FileSidebar({ activeFile, copy, folder, onChooseFolder, onClearRecent, onOpenFile, onOpenFolder, onRemoveRecentFile, onRemoveRecentFolder, onWidthChange, recentFiles, recentFolders, tree, width }: FileSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null)

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()

    const initialWidth = sidebarRef.current?.getBoundingClientRect().width ?? width
    const initialX = event.clientX
    let nextWidth = initialWidth

    const applyWidth = (clientX: number) => {
      nextWidth = Math.min(420, Math.max(220, Math.round(initialWidth + clientX - initialX)))
      sidebarRef.current?.style.setProperty('width', `${nextWidth}px`)
      document.querySelector<HTMLElement>('.app-shell')?.style.setProperty('--sidebar-width', `${nextWidth}px`)
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

  return (
    <aside
      ref={sidebarRef}
      className="file-sidebar"
      aria-label={copy.currentFolder}
      style={{ width }}
    >
      <header className="file-sidebar__header">
        <span className="file-sidebar__header-icon" aria-hidden="true">
          <FolderOpen size={15} strokeWidth={1.8} />
        </span>
        <span className="file-sidebar__header-copy">
          <span className="file-sidebar__eyebrow">{copy.currentFolder}</span>
          <strong className="file-sidebar__title">{folder ? fileName(folder) : copy.emptyFolder}</strong>
        </span>
        <button
          aria-label={copy.changeFolder}
          className="file-sidebar__change-folder"
          title={copy.changeFolder}
          type="button"
          onClick={onChooseFolder}
        >
          <FolderOpen aria-hidden="true" size={14} strokeWidth={1.8} />
          <span>{copy.changeFolder}</span>
        </button>
      </header>
      {(recentFiles.length > 0 || recentFolders.length > 0) ? (
        <section className="file-sidebar__recent" aria-label={copy.recentLabel}>
          <header className="file-sidebar__recent-header">
            <span>{copy.recent}</span>
            <button type="button" onClick={onClearRecent}>{copy.clearRecent}</button>
          </header>
          {recentFiles.map((path) => (
            <div className="file-sidebar__recent-item" key={path}>
              <button aria-current={path === activeFile ? 'page' : undefined} className="file-sidebar__recent-open" title={path} type="button" onClick={() => onOpenFile(path)}>
                <FileText aria-hidden="true" size={13} strokeWidth={1.6} /><span>{fileName(path)}</span>
              </button>
              <button aria-label={copy.removeRecent(fileName(path))} className="file-sidebar__recent-remove" title={copy.removeRecent(fileName(path))} type="button" onClick={() => onRemoveRecentFile(path)}>
                <X aria-hidden="true" size={12} strokeWidth={1.8} />
              </button>
            </div>
          ))}
          {recentFolders.map((path) => (
            <div className="file-sidebar__recent-item" key={path}>
              <button className="file-sidebar__recent-open" title={path} type="button" onClick={() => onOpenFolder(path)}>
                <Folder aria-hidden="true" size={13} strokeWidth={1.6} /><span>{fileName(path)}</span>
              </button>
              <button aria-label={copy.removeRecent(fileName(path))} className="file-sidebar__recent-remove" title={copy.removeRecent(fileName(path))} type="button" onClick={() => onRemoveRecentFolder(path)}>
                <X aria-hidden="true" size={12} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </section>
      ) : null}
      {tree ? (
        <section className="file-sidebar__tree" aria-label={copy.files}>
          <span className="file-sidebar__section-label">{copy.files}</span>
          {tree.children.map((child) => <TreeBranch activeFile={activeFile} key={child.path} node={child} depth={0} onOpenFile={onOpenFile} />)}
        </section>
      ) : (
        <div className="file-sidebar__empty">
          <p>{copy.empty}</p>
          <button type="button" onClick={onChooseFolder}>
            <FolderOpen aria-hidden="true" size={14} strokeWidth={1.7} />
            {copy.chooseFolder}
          </button>
        </div>
      )}
      <div aria-hidden="true" className="file-sidebar__resize-handle" onPointerDown={startResize} />
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

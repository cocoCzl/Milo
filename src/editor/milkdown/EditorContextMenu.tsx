import { Bold, Copy, Italic, Link2, MousePointer2, Scissors } from 'lucide-react'
import { forwardRef, useLayoutEffect, useRef } from 'react'

export type EditorContextMenuCopy = {
  addColumnLeft: string
  addColumnRight: string
  addRowAbove: string
  addRowBelow: string
  bold: string
  copy: string
  cut: string
  deleteColumn: string
  deleteRow: string
  italic: string
  addLink: string
  editLink: string
  insertLink: string
  selectAll: string
}

type EditorContextMenuProps = {
  copy: EditorContextMenuCopy
  hasSelection: boolean
  inTable: boolean
  linkLabel: string
  onCommand: (command: 'cut' | 'copy' | 'select-all' | 'bold' | 'italic' | 'link') => void
  onDismiss: () => void
  onTableCommand: (command: 'row-before' | 'row-after' | 'column-before' | 'column-after' | 'delete-row' | 'delete-column') => void
  position: { left: number; top: number }
}

export const EditorContextMenu = forwardRef<HTMLDivElement, EditorContextMenuProps>(function EditorContextMenu({
  copy,
  hasSelection,
  inTable,
  linkLabel,
  onCommand,
  onDismiss,
  onTableCommand,
  position,
}, forwardedRef) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true })
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    let next = current

    switch (event.key) {
      case 'ArrowDown':
        next = current < 0 ? 0 : (current + 1) % items.length
        break
      case 'ArrowUp':
        next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = items.length - 1
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        event.stopPropagation()
        items[current]?.click()
        return
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        onDismiss()
        return
      default:
        return
    }

    event.preventDefault()
    event.stopPropagation()
    items[next]?.focus({ preventScroll: true })
  }

  return (
    <div
      ref={(node) => {
        rootRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      }}
      className="editor-context-menu"
      role="menu"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.preventDefault()}
    >
      <MenuButton disabled={!hasSelection} icon={<Scissors />} label={copy.cut} shortcut="⌘X" onClick={() => onCommand('cut')} />
      <MenuButton disabled={!hasSelection} icon={<Copy />} label={copy.copy} shortcut="⌘C" onClick={() => onCommand('copy')} />
      <span className="editor-context-menu__divider" aria-hidden="true" />
      <MenuButton icon={<Bold />} label={copy.bold} shortcut="⌘B" onClick={() => onCommand('bold')} />
      <MenuButton icon={<Italic />} label={copy.italic} shortcut="⌘I" onClick={() => onCommand('italic')} />
      <MenuButton icon={<Link2 />} label={linkLabel} shortcut="⌘K" onClick={() => onCommand('link')} />
      <span className="editor-context-menu__divider" aria-hidden="true" />
      <MenuButton icon={<MousePointer2 />} label={copy.selectAll} shortcut="⌘A" onClick={() => onCommand('select-all')} />
      {inTable ? (
        <>
          <span className="editor-context-menu__divider" aria-hidden="true" />
          <MenuButton label={copy.addRowAbove} onClick={() => onTableCommand('row-before')} />
          <MenuButton label={copy.addRowBelow} onClick={() => onTableCommand('row-after')} />
          <MenuButton label={copy.addColumnLeft} onClick={() => onTableCommand('column-before')} />
          <MenuButton label={copy.addColumnRight} onClick={() => onTableCommand('column-after')} />
          <MenuButton danger label={copy.deleteRow} onClick={() => onTableCommand('delete-row')} />
          <MenuButton danger label={copy.deleteColumn} onClick={() => onTableCommand('delete-column')} />
        </>
      ) : null}
    </div>
  )
})

function MenuButton({
  danger = false,
  disabled = false,
  icon,
  label,
  onClick,
  shortcut,
}: {
  danger?: boolean
  disabled?: boolean
  icon?: React.ReactNode
  label: string
  onClick: () => void
  shortcut?: string
}) {
  return (
    <button
      className={danger ? 'editor-context-menu__danger' : undefined}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      role="menuitem"
      tabIndex={-1}
      type="button"
      onClick={onClick}
    >
      <span className="editor-context-menu__icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  )
}

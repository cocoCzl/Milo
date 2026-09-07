import { Bold, ClipboardPaste, Copy, Italic, MousePointer2, Scissors } from 'lucide-react'
import { forwardRef } from 'react'

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
  paste: string
  selectAll: string
}

type EditorContextMenuProps = {
  copy: EditorContextMenuCopy
  hasSelection: boolean
  inTable: boolean
  onCommand: (command: 'cut' | 'copy' | 'paste' | 'select-all' | 'bold' | 'italic') => void
  onTableCommand: (command: 'row-before' | 'row-after' | 'column-before' | 'column-after' | 'delete-row' | 'delete-column') => void
  position: { left: number; top: number }
}

export const EditorContextMenu = forwardRef<HTMLDivElement, EditorContextMenuProps>(function EditorContextMenu({
  copy,
  hasSelection,
  inTable,
  onCommand,
  onTableCommand,
  position,
}, ref) {
  return (
    <div
      ref={ref}
      className="editor-context-menu"
      role="menu"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      <MenuButton disabled={!hasSelection} icon={<Scissors />} label={copy.cut} shortcut="⌘X" onClick={() => onCommand('cut')} />
      <MenuButton disabled={!hasSelection} icon={<Copy />} label={copy.copy} shortcut="⌘C" onClick={() => onCommand('copy')} />
      <MenuButton icon={<ClipboardPaste />} label={copy.paste} shortcut="⌘V" onClick={() => onCommand('paste')} />
      <span className="editor-context-menu__divider" aria-hidden="true" />
      <MenuButton icon={<Bold />} label={copy.bold} shortcut="⌘B" onClick={() => onCommand('bold')} />
      <MenuButton icon={<Italic />} label={copy.italic} shortcut="⌘I" onClick={() => onCommand('italic')} />
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
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      <span className="editor-context-menu__icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  )
}

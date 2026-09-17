import {
  Bold,
  Check,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Strikethrough,
  Table2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type EditorBlockType = 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'blockquote' | 'code-block'
export type EditorToolbarCommand = 'bold' | 'italic' | 'strike' | 'inline-code' | 'bullet-list' | 'ordered-list' | 'blockquote' | 'link' | 'divider' | 'table'

export type EditorToolbarCopy = {
  apply: string
  blockquote: string
  bold: string
  bulletList: string
  cancel: string
  codeBlock: string
  divider: string
  formattingToolbar: string
  heading1: string
  heading2: string
  heading3: string
  inlineCode: string
  italic: string
  link: string
  linkAddress: string
  orderedList: string
  paragraph: string
  strike: string
  table: string
  textStyle: string
}

export type EditorToolbarState = {
  blockType: EditorBlockType
  bold: boolean
  bulletList: boolean
  emphasis: boolean
  hasSelection: boolean
  inlineCode: boolean
  link: boolean
  orderedList: boolean
  strike: boolean
}

type EditorToolbarProps = {
  copy: EditorToolbarCopy
  onBlockChange: (blockType: EditorBlockType) => void
  onCommand: (command: EditorToolbarCommand) => void
  state: EditorToolbarState
}

export function EditorToolbar({
  copy,
  onBlockChange,
  onCommand,
  state,
}: EditorToolbarProps) {
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const blockMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!blockMenuOpen) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !blockMenuRef.current?.contains(event.target)) setBlockMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBlockMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [blockMenuOpen])

  const blockOptions: Array<{ icon: React.ReactNode; label: string; value: EditorBlockType }> = [
    { icon: <Pilcrow />, label: copy.paragraph, value: 'paragraph' },
    { icon: <Heading1 />, label: copy.heading1, value: 'heading-1' },
    { icon: <Heading2 />, label: copy.heading2, value: 'heading-2' },
    { icon: <Heading3 />, label: copy.heading3, value: 'heading-3' },
    { icon: <Quote />, label: copy.blockquote, value: 'blockquote' },
    { icon: <Code2 />, label: copy.codeBlock, value: 'code-block' },
  ]
  const currentBlock = blockOptions.find((option) => option.value === state.blockType) ?? blockOptions[0]

  return (
    <div className="editor-toolbar-wrap">
      <div className="editor-toolbar" role="toolbar" aria-label={copy.formattingToolbar}>
        <div className="editor-toolbar__block-type" ref={blockMenuRef}>
          <button
            aria-expanded={blockMenuOpen}
            aria-haspopup="menu"
            aria-label={copy.textStyle}
            className="editor-toolbar__block-trigger"
            title={`${copy.textStyle} — ${currentBlock.label}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setBlockMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{currentBlock.icon}</span>
          </button>
          {blockMenuOpen ? (
            <div className="editor-block-menu" role="menu">
              {blockOptions.map((option) => (
                <button
                  key={option.value}
                  role="menuitemradio"
                  aria-checked={option.value === state.blockType}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onBlockChange(option.value)
                    setBlockMenuOpen(false)
                  }}
                >
                  <span className="editor-block-menu__icon" aria-hidden="true">{option.icon}</span>
                  <span>{option.label}</span>
                  <Check className="editor-block-menu__check" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <span className="editor-toolbar__divider" aria-hidden="true" />
        <ToolbarButton label={copy.bold} pressed={state.bold} onClick={() => onCommand('bold')}><Bold /></ToolbarButton>
        <ToolbarButton label={copy.italic} pressed={state.emphasis} onClick={() => onCommand('italic')}><Italic /></ToolbarButton>
        <ToolbarButton label={copy.strike} pressed={state.strike} onClick={() => onCommand('strike')}><Strikethrough /></ToolbarButton>
        <ToolbarButton label={copy.inlineCode} pressed={state.inlineCode} onClick={() => onCommand('inline-code')}><Code2 /></ToolbarButton>
        <span className="editor-toolbar__divider" aria-hidden="true" />
        <ToolbarButton label={copy.bulletList} pressed={state.bulletList} onClick={() => onCommand('bullet-list')}><List /></ToolbarButton>
        <ToolbarButton label={copy.orderedList} pressed={state.orderedList} onClick={() => onCommand('ordered-list')}><ListOrdered /></ToolbarButton>
        <ToolbarButton label={copy.blockquote} pressed={state.blockType === 'blockquote'} onClick={() => onCommand('blockquote')}><Quote /></ToolbarButton>
        <span className="editor-toolbar__divider" aria-hidden="true" />
        <ToolbarButton label={copy.link} pressed={state.link} disabled={!state.hasSelection} onClick={() => onCommand('link')}><Link2 /></ToolbarButton>
        <ToolbarButton label={copy.divider} onClick={() => onCommand('divider')}><Minus /></ToolbarButton>
        <ToolbarButton label={copy.table} onClick={() => onCommand('table')}><Table2 /></ToolbarButton>
      </div>
    </div>
  )
}

function ToolbarButton({
  children,
  disabled = false,
  label,
  onClick,
  pressed,
}: {
  children: React.ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
  pressed?: boolean
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="editor-toolbar__button"
      disabled={disabled}
      title={label}
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

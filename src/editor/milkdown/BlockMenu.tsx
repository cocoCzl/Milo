import { Check, Code2, Heading1, Heading2, Heading3, List, ListOrdered, Minus, Pilcrow, Quote, Table2, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { BlockMenuCommand, BlockTarget } from './blockControls'

export type BlockMenuCopy = {
  addBlock: string
  blockquote: string
  bulletList: string
  codeBlock: string
  divider: string
  heading1: string
  heading2: string
  heading3: string
  orderedList: string
  paragraph: string
  table: string
  deleteBlock: string
}

type BlockMenuProps = {
  copy: BlockMenuCopy
  target: BlockTarget
  onClose: () => void
  onCommand: (command: BlockMenuCommand, target: BlockTarget) => void
}

const options: Array<{ command: BlockMenuCommand; icon: React.ReactNode; label: keyof Omit<BlockMenuCopy, 'addBlock'> }> = [
  { command: 'paragraph', icon: <Pilcrow />, label: 'paragraph' },
  { command: 'heading-1', icon: <Heading1 />, label: 'heading1' },
  { command: 'heading-2', icon: <Heading2 />, label: 'heading2' },
  { command: 'heading-3', icon: <Heading3 />, label: 'heading3' },
  { command: 'blockquote', icon: <Quote />, label: 'blockquote' },
  { command: 'bullet-list', icon: <List />, label: 'bulletList' },
  { command: 'ordered-list', icon: <ListOrdered />, label: 'orderedList' },
  { command: 'code-block', icon: <Code2 />, label: 'codeBlock' },
  { command: 'table', icon: <Table2 />, label: 'table' },
  { command: 'divider', icon: <Minus />, label: 'divider' },
]

export function BlockMenu({ copy, onClose, onCommand, target }: BlockMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const top = Math.max(8, Math.min(target.rect.top, window.innerHeight - 392))
  const left = Math.max(8, Math.min(target.rect.left - 8, window.innerWidth - 230))

  return (
    <div ref={rootRef} aria-label={copy.addBlock} className="block-menu" data-milo-block-ui="menu" role="menu" style={{ left, top }}>
      {options.map((option) => {
        const active = option.command === target.blockType
        const insertOnly = option.command === 'table' || option.command === 'divider'
        return (
          <button
            key={option.command}
            aria-checked={insertOnly ? undefined : active}
            role={insertOnly ? 'menuitem' : 'menuitemradio'}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onCommand(option.command, target)}
          >
            <span className="block-menu__icon" aria-hidden="true">{option.icon}</span>
            <span>{copy[option.label]}</span>
            {!insertOnly ? <Check className="block-menu__check" aria-hidden="true" /> : <span />}
          </button>
        )
      })}
      <div className="block-menu__separator" role="separator" />
      <button
        className="block-menu__delete"
        role="menuitem"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onCommand('delete-block', target)}
      >
        <span className="block-menu__icon" aria-hidden="true"><Trash2 /></span>
        <span>{copy.deleteBlock}</span>
        <span />
      </button>
    </div>
  )
}

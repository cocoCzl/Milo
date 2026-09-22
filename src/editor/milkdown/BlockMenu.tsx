import { Check, ChevronRight, Code2, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, List, ListOrdered, Minus, Pilcrow, Quote, Table2, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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
  heading4: string
  heading5: string
  heading6: string
  moreHeadings: string
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

const moreOptions = [
  { command: 'heading-4', icon: <Heading4 />, label: 'heading4' },
  { command: 'heading-5', icon: <Heading5 />, label: 'heading5' },
  { command: 'heading-6', icon: <Heading6 />, label: 'heading6' },
] as const

// Geometry only: never resolve a new editor target while laying out the menu.
function placeBlockSubmenu(main: DOMRect, trigger: DOMRect, width: number, height: number, bounds: { left: number; right: number; top: number; bottom: number }) {
  const side = main.right + width <= bounds.right ? 'right' : 'left'
  return {
    side,
    left: Math.max(bounds.left, Math.min(side === 'right' ? main.right : main.left - width, bounds.right - width)),
    top: Math.max(bounds.top, Math.min(trigger.top, bounds.bottom - height)),
  }
}

export function BlockMenu({ copy, onClose, onCommand, target }: BlockMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const focusSubmenuRef = useRef(false)
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const submenuId = useId()
  const moreActive = moreOptions.some((option) => option.command === target.blockType)

  useLayoutEffect(() => {
    const root = rootRef.current
    const panel = panelRef.current
    if (!root || !panel) return
    // The overlay is portaled beside the stage, not inside its scroll container.
    const stageElement = root.closest('.app-shell')?.querySelector('.document-stage') ?? root.closest('.document-stage')
    const layout = () => {
      const stage = stageElement?.getBoundingClientRect()
      const bounds = {
        left: Math.max(0, stage?.left ?? 0) + 8,
        right: Math.min(window.innerWidth, stage?.right ?? window.innerWidth) - 8,
        top: Math.max(0, stage?.top ?? 0) + 8,
        bottom: Math.min(window.innerHeight, stage?.bottom ?? window.innerHeight) - 8,
      }
      const width = Math.max(0, bounds.right - bounds.left)
      const height = Math.max(0, bounds.bottom - bounds.top)
      root.style.width = `${Math.min(220, width)}px`
      panel.style.maxHeight = `${Math.max(0, height - 14)}px`
      root.style.left = `${Math.max(bounds.left, Math.min(target.rect.left - 8, bounds.right - root.getBoundingClientRect().width))}px`
      root.style.top = `${Math.max(bounds.top, Math.min(target.rect.top, bounds.bottom - root.getBoundingClientRect().height))}px`
      const submenu = submenuRef.current
      const trigger = triggerRef.current
      if (submenu && trigger) {
        submenu.style.width = `${Math.min(212, width)}px`
        submenu.style.maxHeight = `${height}px`
        const rect = submenu.getBoundingClientRect()
        const position = placeBlockSubmenu(root.getBoundingClientRect(), trigger.getBoundingClientRect(), rect.width, rect.height, bounds)
        submenu.dataset.side = position.side
        submenu.style.left = `${position.left}px`
        submenu.style.top = `${position.top}px`
      }
    }
    layout()
    if (focusSubmenuRef.current) {
      submenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
      focusSubmenuRef.current = false
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout)
    observer?.observe(panel)
    if (stageElement) observer?.observe(stageElement)
    window.addEventListener('resize', layout)
    panel.addEventListener('scroll', layout)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', layout)
      panel.removeEventListener('scroll', layout)
    }
  }, [submenuOpen, target.rect.left, target.rect.top])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab'].includes(event.key)) return
      const inSubmenu = Boolean(submenuRef.current?.contains(document.activeElement))
      if (event.key === 'Tab') { onClose(); return }
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape' || (event.key === 'ArrowLeft' && inSubmenu)) {
        if (submenuOpen) {
          setSubmenuOpen(false)
          triggerRef.current?.focus({ preventScroll: true })
        } else if (event.key === 'Escape') onClose()
        return
      }
      if ((event.key === 'Enter' || event.key === 'ArrowRight') && document.activeElement === triggerRef.current) {
        if (submenuOpen) submenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
        else { focusSubmenuRef.current = true; setSubmenuOpen(true) }
        return
      }
      const buttons = Array.from((inSubmenu ? submenuRef.current : panelRef.current)?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'Enter') { buttons[index]?.click(); return }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        if (!inSubmenu && buttons[next] !== triggerRef.current) setSubmenuOpen(false)
        buttons[next]?.focus({ preventScroll: true })
        buttons[next]?.scrollIntoView?.({ block: 'nearest' })
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose, submenuOpen])

  return (
    <div ref={rootRef} aria-label={copy.addBlock} className="block-menu" data-milo-block-ui="menu" role="menu">
      <div ref={panelRef} className="block-menu__items">
        {options.map((option) => {
          const active = option.command === target.blockType
          const insertOnly = option.command === 'table' || option.command === 'divider'
          return (
            <Fragment key={option.command}>
              <button
                aria-checked={insertOnly ? undefined : active}
                role={insertOnly ? 'menuitem' : 'menuitemradio'}
                type="button"
                tabIndex={option.command === 'paragraph' ? 0 : -1}
                onPointerEnter={() => setSubmenuOpen(false)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onCommand(option.command, target)}
              >
                <span className="block-menu__icon" aria-hidden="true">{option.icon}</span>
                <span>{copy[option.label]}</span>
                {!insertOnly ? <Check className="block-menu__check" aria-hidden="true" /> : <span />}
              </button>
              {option.command === 'heading-3' ? (
                <button
                  ref={triggerRef}
                  aria-haspopup="menu"
                  aria-expanded={submenuOpen}
                  aria-controls={submenuOpen ? submenuId : undefined}
                  className={moreActive ? 'block-menu__more--active' : undefined}
                  role="menuitem"
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerEnter={() => setSubmenuOpen(true)}
                  onClick={() => setSubmenuOpen(true)}
                >
                  <span className="block-menu__icon" aria-hidden="true"><Heading4 /></span>
                  <span>{copy.moreHeadings}</span><ChevronRight aria-hidden="true" />
                </button>
              ) : null}
            </Fragment>
          )
        })}
        <div className="block-menu__separator" role="separator" />
        <button
          className="block-menu__delete"
          role="menuitem"
          type="button"
          tabIndex={-1}
          onPointerEnter={() => setSubmenuOpen(false)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onCommand('delete-block', target)}
        >
          <span className="block-menu__icon" aria-hidden="true"><Trash2 /></span>
          <span>{copy.deleteBlock}</span>
          <span />
        </button>
      </div>
      {submenuOpen ? (
        <div ref={submenuRef} className="block-menu__submenu-corridor" data-milo-block-ui="submenu">
          <div id={submenuId} className="block-menu__submenu" role="menu" aria-label={copy.moreHeadings}>
            {moreOptions.map((option) => (
              <button key={option.command} role="menuitemradio" aria-checked={target.blockType === option.command} type="button" tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand(option.command, target)}>
                <span className="block-menu__icon" aria-hidden="true">{option.icon}</span>
                <span>{copy[option.label]}</span><Check className="block-menu__check" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

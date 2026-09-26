import { Ellipsis, FolderOpen, FolderTree, Save, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

type ApplicationMoreMenuProps = {
  dismissed?: boolean
  labels: {
    more: string
    open: string
    openFolder: string
    saveAs: string
    settings: string
  }
  onOpen: () => void
  onOpenFolder: () => void
  onOpenSettings: (trigger: HTMLButtonElement) => void
  onSaveAs: () => void
  saveAsDisabled?: boolean
  shortcuts: {
    open: string
    openFolder: string
    saveAs: string
  }
}

type MenuActionProps = {
  children: ReactNode
  disabled?: boolean
  icon: ReactNode
  onSelect: () => void
  shortcut?: string
  setRef: (element: HTMLButtonElement | null) => void
}

export function ApplicationMoreMenu({
  dismissed = false,
  labels,
  onOpen,
  onOpenFolder,
  onOpenSettings,
  onSaveAs,
  saveAsDisabled = false,
  shortcuts,
}: ApplicationMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const enabledItems = () => itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled))
  const focusItem = (direction: 'first' | 'last') => {
    const items = enabledItems()
    items[direction === 'first' ? 0 : items.length - 1]?.focus()
  }

  const openMenu = (focus: 'first' | 'last' = 'first') => {
    setOpen(true)
    queueMicrotask(() => focusItem(focus))
  }

  const closeMenu = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus())
  }

  const select = (action: () => void) => {
    setOpen(false)
    action()
  }

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [open])

  useEffect(() => {
    if (dismissed) setOpen(false)
  }, [dismissed])

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openMenu('first')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu('last')
    }
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
      return
    }

    const items = enabledItems()
    if (items.length === 0) return
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % items.length
    if (event.key === 'ArrowUp') nextIndex = activeIndex < 0 ? items.length - 1 : (activeIndex - 1 + items.length) % items.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = items.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    items[nextIndex]?.focus()
  }

  return (
    <div className="application-more-menu" ref={rootRef}>
      <span className="icon-button-shell">
        <button
          ref={triggerRef}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={labels.more}
          className="icon-button application-more-menu__trigger"
          type="button"
          onClick={() => open ? closeMenu() : openMenu()}
          onKeyDown={handleTriggerKeyDown}
        >
          <Ellipsis aria-hidden="true" size={16} strokeWidth={1.8} />
        </button>
        <span aria-hidden="true" className="icon-button__tooltip">{labels.more}</span>
      </span>
      {open ? (
        <div aria-label={labels.more} className="application-more-menu__surface" role="menu" onKeyDown={handleMenuKeyDown}>
          <MenuAction
            icon={<FolderOpen aria-hidden="true" size={15} strokeWidth={1.7} />}
            onSelect={() => select(onOpen)}
            setRef={(element) => { itemRefs.current[0] = element }}
            shortcut={shortcuts.open}
          >
            {labels.open}
          </MenuAction>
          <MenuAction
            icon={<FolderTree aria-hidden="true" size={15} strokeWidth={1.7} />}
            onSelect={() => select(onOpenFolder)}
            setRef={(element) => { itemRefs.current[1] = element }}
            shortcut={shortcuts.openFolder}
          >
            {labels.openFolder}
          </MenuAction>
          <div className="application-more-menu__separator" role="separator" />
          <MenuAction
            disabled={saveAsDisabled}
            icon={<Save aria-hidden="true" size={15} strokeWidth={1.7} />}
            onSelect={() => select(onSaveAs)}
            setRef={(element) => { itemRefs.current[2] = element }}
            shortcut={shortcuts.saveAs}
          >
            {labels.saveAs}
          </MenuAction>
          <div className="application-more-menu__separator" role="separator" />
          <MenuAction
            icon={<Settings2 aria-hidden="true" size={15} strokeWidth={1.7} />}
            onSelect={() => select(() => {
              if (triggerRef.current) onOpenSettings(triggerRef.current)
            })}
            setRef={(element) => { itemRefs.current[3] = element }}
          >
            {labels.settings}
          </MenuAction>
        </div>
      ) : null}
    </div>
  )
}

function MenuAction({ children, disabled = false, icon, onSelect, setRef, shortcut }: MenuActionProps) {
  return (
    <button ref={setRef} className="application-more-menu__item" disabled={disabled} role="menuitem" type="button" onClick={onSelect}>
      <span className="application-more-menu__item-icon">{icon}</span>
      <span>{children}</span>
      {shortcut ? <span aria-hidden="true" className="application-more-menu__shortcut">{shortcut}</span> : null}
    </button>
  )
}

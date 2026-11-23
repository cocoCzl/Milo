import { Check, Ellipsis } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { IconButton } from './IconButton'

export type MenuAction = {
  label: string
  icon?: ReactNode
  shortcut?: string
  disabled?: boolean
  checked?: boolean
  description?: string
  separatorBefore?: boolean
  onSelect: (trigger: HTMLButtonElement) => void
}

export function ActionMenu({
  label,
  actions,
  dismissed = false,
}: {
  label: string
  actions: MenuAction[]
  dismissed?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const initialFocus = useRef<'first' | 'last'>('first')
  const id = useId()
  const items = () => [
    ...(surface.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
  ]
  const close = (restore = false) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect()
      const menu = surface.current?.getBoundingClientRect()
      if (!anchor || !menu) return
      setPosition({
        left: Math.max(8, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - 8)),
        top: Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - menu.height - 8)),
      })
    }
    place()
    const enabled = items()
    enabled[initialFocus.current === 'first' ? 0 : enabled.length - 1]?.focus()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !surface.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setOpen(false)
    }
    const focusOutside = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !surface.current?.contains(event.target) &&
        event.target !== trigger.current
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', focusOutside)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', focusOutside)
    }
  }, [open])
  useEffect(() => {
    if (dismissed) setOpen(false)
  }, [dismissed])
  return (
    <div className="application-more-menu">
      <IconButton
        ref={trigger}
        className="application-more-menu__trigger"
        label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = 'first'
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
            setOpen(true)
          }
        }}
      >
        <Ellipsis aria-hidden="true" size={16} strokeWidth={1.8} />
      </IconButton>
      {open
        ? createPortal(
            <div
              ref={surface}
              id={id}
              role="menu"
              aria-label={label}
              className="application-more-menu__surface action-menu__surface"
              style={position}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  close(true)
                  return
                }
                if (event.key === 'Tab') {
                  close(true)
                  return
                }
                const enabled = items()
                const index = enabled.indexOf(document.activeElement as HTMLButtonElement)
                let next: number | undefined
                if (event.key === 'ArrowDown') next = (index + 1) % enabled.length
                if (event.key === 'ArrowUp') next = (index - 1 + enabled.length) % enabled.length
                if (event.key === 'Home') next = 0
                if (event.key === 'End') next = enabled.length - 1
                if (next !== undefined) {
                  event.preventDefault()
                  enabled[next]?.focus()
                }
              }}
            >
              {actions.map((action, index) => (
                <div key={action.label} role="none">
                  {action.separatorBefore ? (
                    <div role="separator" className="application-more-menu__separator" />
                  ) : null}
                  <button
                    type="button"
                    role={action.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                    aria-checked={action.checked}
                    aria-label={action.label}
                    aria-describedby={action.description ? `${id}-${index}` : undefined}
                    className="application-more-menu__item"
                    disabled={action.disabled}
                    onClick={() => {
                      close(true)
                      if (trigger.current) action.onSelect(trigger.current)
                    }}
                  >
                    <span className="application-more-menu__item-icon">
                      {action.checked === undefined ? (
                        action.icon
                      ) : action.checked ? (
                        <Check aria-hidden="true" size={15} />
                      ) : null}
                    </span>
                    <span>{action.label}</span>
                    {action.shortcut ? (
                      <span aria-hidden="true" className="application-more-menu__shortcut">
                        {action.shortcut}
                      </span>
                    ) : null}
                  </button>
                  {action.description ? (
                    <p id={`${id}-${index}`} className="action-menu__description">
                      {action.description}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>,
            trigger.current?.closest('.app-shell') ?? document.body,
          )
        : null}
    </div>
  )
}

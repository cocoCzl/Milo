import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactElement, type RefAttributes } from 'react'
import { createPortal } from 'react-dom'

type TooltipProps = {
  children: ReactElement<TooltipTriggerProps>
  content: string
  delay?: number
  disabled?: boolean
}

type TooltipTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & RefAttributes<HTMLButtonElement>

type TooltipPosition = {
  left: number
  top: number
}

const VIEWPORT_MARGIN = 8
const TRIGGER_GAP = 7

export function Tooltip({ children, content, delay = 350, disabled = false }: TooltipProps) {
  const tooltipId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const tooltipRef = useRef<HTMLSpanElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusedRef = useRef(false)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const hide = useCallback(() => {
    clearTimer()
    setVisible(false)
    setPosition(null)
  }, [clearTimer])

  const showAfterDelay = useCallback(() => {
    if (disabled) return
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setVisible(true)
    }, delay)
  }, [clearTimer, delay, disabled])

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger || !tooltip) return

    const triggerRect = trigger.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    const preferredLeft = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
    const left = Math.min(
      window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, preferredLeft),
    )
    const below = triggerRect.bottom + TRIGGER_GAP
    const above = triggerRect.top - tooltipRect.height - TRIGGER_GAP
    const top = below + tooltipRect.height <= window.innerHeight - VIEWPORT_MARGIN
      ? below
      : Math.max(VIEWPORT_MARGIN, above)
    setPosition({ left, top })
  }, [])

  useLayoutEffect(() => {
    if (!visible) return
    updatePosition()
  }, [updatePosition, visible])

  useEffect(() => {
    if (!visible) return undefined
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [updatePosition, visible])

  useEffect(() => hide, [hide])

  useEffect(() => {
    if (disabled) hide()
  }, [disabled, hide])

  const childProps = children.props
  const childRef = childProps.ref
  const trigger = cloneElement(children, {
    'aria-describedby': visible ? tooltipId : undefined,
    onBlur: (event) => {
      childProps.onBlur?.(event)
      focusedRef.current = false
      hide()
    },
    onFocus: (event) => {
      childProps.onFocus?.(event)
      focusedRef.current = true
      showAfterDelay()
    },
    onKeyDown: (event) => {
      childProps.onKeyDown?.(event)
      if (event.key === 'Escape') hide()
    },
    onMouseEnter: (event) => {
      childProps.onMouseEnter?.(event)
      showAfterDelay()
    },
    onMouseLeave: (event) => {
      childProps.onMouseLeave?.(event)
      if (!focusedRef.current) hide()
    },
    ref: (element: HTMLButtonElement | null) => {
      triggerRef.current = element
      if (typeof childRef === 'function') childRef(element)
      else if (childRef) childRef.current = element
    },
  })

  return (
    <>
      {trigger}
      {visible ? createPortal(
        <span
          ref={tooltipRef}
          className="milo-tooltip"
          id={tooltipId}
          role="tooltip"
          style={position ?? undefined}
        >
          {content}
        </span>,
        document.body,
      ) : null}
    </>
  )
}

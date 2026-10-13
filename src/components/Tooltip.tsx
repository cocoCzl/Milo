import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type RefAttributes,
} from 'react'
import { createPortal } from 'react-dom'

type TooltipProps = {
  children: ReactElement<TooltipTriggerProps>
  content: string
  delay?: number
  disabled?: boolean
}

type TooltipTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> &
  RefAttributes<HTMLButtonElement>

type TooltipPosition = {
  left: number
  top: number
}

const VIEWPORT_MARGIN = 8
const TRIGGER_GAP = 7

export function Tooltip({ children, content, delay = 350, disabled = false }: TooltipProps) {
  const inactive = disabled || children.props.disabled === true
  const tooltipId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const tooltipRef = useRef<HTMLSpanElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusedRef = useRef(false)
  const pointerFocusRef = useRef(false)
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
    if (inactive) return
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setVisible(true)
    }, delay)
  }, [clearTimer, delay, inactive])

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
    const top =
      below + tooltipRect.height <= window.innerHeight - VIEWPORT_MARGIN
        ? below
        : Math.max(VIEWPORT_MARGIN, above)
    setPosition({ left, top })
  }, [])

  // The surface is pointer-events:none. Hit-test it and the small trigger gap
  // without adding an invisible overlay or delaying dismissal elsewhere.
  const isWithinHoverArea = useCallback((x: number, y: number) => {
    const trigger = triggerRef.current?.getBoundingClientRect()
    const tooltip = tooltipRef.current?.getBoundingClientRect()
    if (!trigger || !tooltip || !trigger.width || !tooltip.width) return false
    return (
      x >= Math.min(trigger.left, tooltip.left) &&
      x <= Math.max(trigger.right, tooltip.right) &&
      y >= Math.min(trigger.top, tooltip.top) &&
      y <= Math.max(trigger.bottom, tooltip.bottom)
    )
  }, [])

  useLayoutEffect(() => {
    if (!visible) return
    updatePosition()
  }, [updatePosition, visible])

  useEffect(() => {
    if (!visible) return undefined
    const onMouseMove = (event: MouseEvent) => {
      if (!focusedRef.current && !isWithinHoverArea(event.clientX, event.clientY)) hide()
    }
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [hide, isWithinHoverArea, updatePosition, visible])

  useEffect(() => hide, [hide])

  useEffect(() => {
    const onPointerDown = () => {
      pointerFocusRef.current = true
      focusedRef.current = false
      hide()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') pointerFocusRef.current = false
      if (event.key === 'Escape') hide()
    }
    const onWindowBlur = () => {
      focusedRef.current = false
      hide()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [hide])

  useEffect(() => {
    if (inactive) hide()
  }, [hide, inactive])

  const childProps = children.props
  const childRef = childProps.ref
  const trigger = cloneElement(children, {
    'aria-describedby': visible
      ? [childProps['aria-describedby'], tooltipId].filter(Boolean).join(' ')
      : childProps['aria-describedby'],
    onBlur: (event) => {
      childProps.onBlur?.(event)
      focusedRef.current = false
      hide()
    },
    onFocus: (event) => {
      childProps.onFocus?.(event)
      focusedRef.current = !pointerFocusRef.current
      if (focusedRef.current) showAfterDelay()
    },
    onClick: (event) => {
      focusedRef.current = false
      hide()
      childProps.onClick?.(event)
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
      if (!focusedRef.current && !isWithinHoverArea(event.clientX, event.clientY)) hide()
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
      {visible
        ? createPortal(
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
          )
        : null}
    </>
  )
}

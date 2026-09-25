import { Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ContextualEditorStore } from './contextualEditorStore'
import { blockTargetAtCoords, blockTargetAtPosition, type BlockTarget } from './blockControls'
import { isWithinBlockHoverCorridor, resolveBlockHandleHover } from './blockHandleHover'

const handleSize = 26
const visualGutterGap = 14
const stageInset = 8

type VerticalRect = { top: number; bottom: number }

function blockHandleTop(blockRect: VerticalRect, stageRect: VerticalRect): number | null {
  const visibleTop = Math.max(blockRect.top, stageRect.top)
  const visibleBottom = Math.min(blockRect.bottom, stageRect.bottom)
  if (visibleBottom <= visibleTop) return null

  const preferredTop = visibleTop + (visibleBottom - visibleTop - handleSize) / 2
  const minTop = stageRect.top + stageInset
  const maxTop = stageRect.bottom - handleSize - stageInset
  if (maxTop < minTop) return stageRect.top + (stageRect.bottom - stageRect.top - handleSize) / 2
  return Math.max(minTop, Math.min(preferredTop, maxTop))
}

type BlockHandleProps = {
  active: boolean
  editorId: string
  interactionOpen: boolean
  label: string
  menuTarget: BlockTarget | null
  onOpenMenu: (target: BlockTarget) => void
  store: ContextualEditorStore
}

function isBlockUiTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-milo-block-ui]'))
}

function eventIsInBlockUi(event: PointerEvent) {
  return event.composedPath().some((target) => isBlockUiTarget(target))
}

function sameTarget(current: BlockTarget | null, next: BlockTarget | null) {
  return current?.doc === next?.doc && current?.targetBlockPosition === next?.targetBlockPosition
}

export function BlockHandle({ active, editorId, interactionOpen, label, menuTarget, onOpenMenu, store }: BlockHandleProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [hoverTarget, setHoverTarget] = useState<BlockTarget | null>(null)
  const hoverTargetRef = useRef<BlockTarget | null>(null)
  const frameRef = useRef(0)
  const pointerRef = useRef<{ left: number; top: number } | null>(null)
  const [, setGeometryVersion] = useState(0)
  const selected = snapshot.state?.selection
  const hasTextSelection = Boolean(selected && !selected.empty)
  const blocked = !active || interactionOpen || hasTextSelection
  const target = menuTarget ?? (blocked ? null : hoverTarget)

  const setStableHoverTarget = useCallback((next: BlockTarget | null) => {
    const current = hoverTargetRef.current
    const stable = sameTarget(current, next) ? current : next
    if (current === stable) return
    hoverTargetRef.current = stable
    setHoverTarget(stable)
  }, [])

  useEffect(() => {
    if (blocked || menuTarget) {
      setStableHoverTarget(null)
      return undefined
    }
    const view = snapshot.view
    const root = view?.dom.closest<HTMLElement>('.milkdown-editor')
    if (!view || !root) return undefined

    const resolve = () => {
      frameRef.current = 0
      const pointer = pointerRef.current
      if (!pointer || !view.dom.isConnected) return
      const direct = blockTargetAtCoords(view, editorId, pointer)
      const fallback = direct ?? blockTargetAtCoords(view, editorId, { left: view.dom.getBoundingClientRect().left + 2, top: pointer.top })
      const current = hoverTargetRef.current
      const next = resolveBlockHandleHover({
        current,
        candidate: fallback,
        pointer,
        pointerInBlockUi: false,
      })
      setStableHoverTarget(next)
    }
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { left: event.clientX, top: event.clientY }
      if (!frameRef.current) frameRef.current = requestAnimationFrame(resolve)
    }
    const onPointerLeave = (event: PointerEvent) => {
      const current = hoverTargetRef.current
      const retainForBlockUi = isBlockUiTarget(event.relatedTarget)
      const retainForCorridor = Boolean(current && isWithinBlockHoverCorridor(current, { left: event.clientX, top: event.clientY }))
      if (!retainForBlockUi && !retainForCorridor) setStableHoverTarget(null)
    }
    const onDocumentPointerMove = (event: PointerEvent) => {
      const current = hoverTargetRef.current
      if (!current || root.contains(event.target as Node)) return
      if (eventIsInBlockUi(event)) return
      if (isWithinBlockHoverCorridor(current, { left: event.clientX, top: event.clientY })) return
      setStableHoverTarget(null)
    }
    root.addEventListener('pointermove', onPointerMove, { passive: true })
    root.addEventListener('pointerleave', onPointerLeave, { passive: true })
    document.addEventListener('pointermove', onDocumentPointerMove, { capture: true, passive: true })
    return () => {
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('pointermove', onDocumentPointerMove, { capture: true })
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [blocked, editorId, menuTarget, setStableHoverTarget, snapshot.view])

  useEffect(() => {
    const stage = snapshot.view?.dom.closest<HTMLElement>('.document-stage')
    if (!stage) return undefined
    const refreshGeometry = () => {
      setGeometryVersion((version) => version + 1)
    }
    stage.addEventListener('scroll', refreshGeometry, { capture: true, passive: true })
    window.addEventListener('resize', refreshGeometry, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refreshGeometry)
    observer?.observe(stage)
    return () => {
      stage.removeEventListener('scroll', refreshGeometry, { capture: true })
      window.removeEventListener('resize', refreshGeometry)
      observer?.disconnect()
    }
  }, [snapshot.view])

  useEffect(() => {
    if (blocked || menuTarget || !snapshot.view || !selected?.empty || !selected.$from.parent.inlineContent) return
    const cursorTarget = blockTargetAtPosition(snapshot.view, editorId, selected.from)
    if (cursorTarget) setStableHoverTarget(cursorTarget)
  }, [blocked, editorId, menuTarget, selected, setStableHoverTarget, snapshot.view])

  if (!target) return null
  const stage = snapshot.view?.dom.closest<HTMLElement>('.document-stage')
  const liveRect = snapshot.view?.state?.doc === target.doc
    ? blockTargetAtPosition(snapshot.view, editorId, target.targetBlockPosition)?.rect
    : null
  const rect = liveRect ?? target.rect
  // Production editors always live in a document stage. The stage-less path
  // keeps embedded/test consumers on the pre-existing block-center behavior
  // without treating the global window as a document viewport.
  const top = stage
    ? blockHandleTop(rect, stage.getBoundingClientRect())
    : rect.top + (rect.bottom - rect.top - handleSize) / 2
  if (top === null) return null
  // `rect` is the visual anchor supplied by blockControls: for a quote it is
  // the quote boundary, for a table/list/code it is the outer block edge.
  // Every block therefore gets one shared, fixed gap outside its own visual
  // boundary instead of type-specific offsets.
  const left = Math.max(8, rect.left - handleSize - visualGutterGap)
  return (
    <button
      aria-expanded={Boolean(menuTarget)}
      aria-haspopup="menu"
      aria-label={label}
      className={`block-handle${menuTarget ? ' block-handle--open' : ''}`}
      data-milo-block-ui="handle"
      style={{ left, top }}
      title={label}
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onOpenMenu(target)}
    >
      <Plus aria-hidden="true" />
    </button>
  )
}

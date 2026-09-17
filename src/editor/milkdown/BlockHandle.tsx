import { Plus } from 'lucide-react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ContextualEditorStore } from './contextualEditorStore'
import { blockTargetAtCoords, blockTargetAtPosition, type BlockTarget } from './blockControls'
import { isWithinBlockHoverCorridor, resolveBlockHandleHover } from './blockHandleHover'

type BlockHandleProps = {
  active: boolean
  editorId: string
  interactionOpen: boolean
  label: string
  menuTarget: BlockTarget | null
  onOpenMenu: (target: BlockTarget) => void
  store: ContextualEditorStore
}

type PointerLogTarget = { tag: string; className: string | null }

function describeTarget(target: EventTarget | null): PointerLogTarget | null {
  if (!(target instanceof Element)) return null
  return { tag: target.tagName, className: target.getAttribute('class') }
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

// Temporary P0 instrumentation. It is strictly observation-only and shares
// the existing development diagnostic sink; production builds never call it.
function logBlockHandleDiagnostic(kind: string, payload: Record<string, unknown>) {
  if (globalThis.location?.hostname !== 'localhost' || !isTauri()) return
  void invoke('append_link_p0_diagnostic_log', {
    entry: JSON.stringify({ kind: `block-handle-${kind}`, timestamp: new Date().toISOString(), payload }),
  }).catch(() => undefined)
}

export function BlockHandle({ active, editorId, interactionOpen, label, menuTarget, onOpenMenu, store }: BlockHandleProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [hoverTarget, setHoverTarget] = useState<BlockTarget | null>(null)
  const hoverTargetRef = useRef<BlockTarget | null>(null)
  const frameRef = useRef(0)
  const pointerRef = useRef<{ left: number; top: number } | null>(null)
  const visibleRef = useRef<number | null>(null)
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
    const next = target?.targetBlockPosition ?? null
    if (visibleRef.current === next) return
    logBlockHandleDiagnostic('visibility', {
      previousBlockPosition: visibleRef.current,
      nextBlockPosition: next,
      reason: menuTarget ? 'menu-target' : blocked ? 'blocked' : next === null ? 'no-hover-target' : 'hover-target',
      blocked,
    })
    visibleRef.current = next
  }, [blocked, menuTarget, target])

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
      logBlockHandleDiagnostic('resolve', {
        pointer,
        directBlockPosition: direct?.targetBlockPosition ?? null,
        fallbackBlockPosition: fallback?.targetBlockPosition ?? null,
        currentBlockPosition: current?.targetBlockPosition ?? null,
        result: next ? (next === current ? 'keep:owned-corridor' : 'set:activation-gutter') : 'clear:outside-corridor',
      })
      setStableHoverTarget(next)
    }
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { left: event.clientX, top: event.clientY }
      logBlockHandleDiagnostic('pointermove', {
        pointer: pointerRef.current,
        eventTarget: describeTarget(event.target),
        composedPath: event.composedPath().slice(0, 3).map(describeTarget),
        currentBlockPosition: hoverTargetRef.current?.targetBlockPosition ?? null,
        handleVisible: visibleRef.current !== null,
      })
      if (!frameRef.current) frameRef.current = requestAnimationFrame(resolve)
    }
    const onPointerLeave = (event: PointerEvent) => {
      const current = hoverTargetRef.current
      const retainForBlockUi = isBlockUiTarget(event.relatedTarget)
      const retainForCorridor = Boolean(current && isWithinBlockHoverCorridor(current, { left: event.clientX, top: event.clientY }))
      logBlockHandleDiagnostic('root-leave', {
        eventTarget: describeTarget(event.target),
        relatedTarget: describeTarget(event.relatedTarget),
        currentBlockPosition: current?.targetBlockPosition ?? null,
        result: retainForBlockUi ? 'retain:block-ui' : retainForCorridor ? 'retain:owned-corridor' : 'clear:outside-corridor',
      })
      if (!retainForBlockUi && !retainForCorridor) setStableHoverTarget(null)
    }
    const onDocumentPointerMove = (event: PointerEvent) => {
      const current = hoverTargetRef.current
      if (!current || root.contains(event.target as Node)) return
      if (eventIsInBlockUi(event)) {
        logBlockHandleDiagnostic('ownership', { currentBlockPosition: current.targetBlockPosition, result: 'retain:block-ui' })
        return
      }
      if (isWithinBlockHoverCorridor(current, { left: event.clientX, top: event.clientY })) {
        logBlockHandleDiagnostic('ownership', { currentBlockPosition: current.targetBlockPosition, result: 'retain:owned-corridor' })
        return
      }
      logBlockHandleDiagnostic('ownership', { currentBlockPosition: current.targetBlockPosition, result: 'clear:outside-editor-and-corridor' })
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
    if (blocked || menuTarget || !snapshot.view || !selected?.empty || !selected.$from.parent.inlineContent) return
    const cursorTarget = blockTargetAtPosition(snapshot.view, editorId, selected.from)
    if (cursorTarget) setStableHoverTarget(cursorTarget)
  }, [blocked, editorId, menuTarget, selected, setStableHoverTarget, snapshot.view])

  if (!target) return null
  const top = Math.max(8, Math.min(target.rect.top + (target.rect.bottom - target.rect.top - 26) / 2, window.innerHeight - 34))
  const left = Math.max(8, target.rect.left - 34)
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
      onPointerEnter={(event) => logBlockHandleDiagnostic('button-enter', {
        eventTarget: describeTarget(event.target),
        targetBlockPosition: target.targetBlockPosition,
        menuOpen: Boolean(menuTarget),
      })}
      onPointerMove={(event) => logBlockHandleDiagnostic('button-move', {
        eventTarget: describeTarget(event.target),
        targetBlockPosition: target.targetBlockPosition,
        menuOpen: Boolean(menuTarget),
      })}
      onClick={() => onOpenMenu(target)}
    >
      <Plus aria-hidden="true" />
    </button>
  )
}

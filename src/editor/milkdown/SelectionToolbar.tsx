import { Bold, Code2, Italic, Link2, Strikethrough } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { MutableRefObject } from 'react'
import { TextSelection } from '@milkdown/prose/state'
import type { ContextualEditorStore } from './contextualEditorStore'

export type SelectionToolbarCopy = {
  bold: string
  formattingToolbar: string
  inlineCode: string
  italic: string
  link: string
  strike: string
}

type Position = { left: number; top: number } | null

type SelectionToolbarProps = {
  active: boolean
  copy: SelectionToolbarCopy
  containsInteractionTarget: (target: EventTarget | null) => boolean
  dismissedSelectionRef: MutableRefObject<string | null>
  interactionOpen?: boolean
  onCommand: (command: 'bold' | 'italic' | 'strike' | 'inline-code') => void
  onLink: (anchor: { left: number; top: number }) => void
  store: ContextualEditorStore
}

function selectionKey(from: number, to: number) {
  return `${from}:${to}`
}

function hasMark(name: string, state: ReturnType<ContextualEditorStore['getSnapshot']>['state']) {
  if (!state) return false
  const mark = state.schema.marks[name]
  return Boolean(mark && state.doc.rangeHasMark(state.selection.from, state.selection.to, mark))
}

function linkHref(state: ReturnType<ContextualEditorStore['getSnapshot']>['state']) {
  if (!state) return null
  const mark = state.schema.marks.link
  if (!mark) return null
  let href: string | null = null
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    const link = mark.isInSet(node.marks)
    if (link && typeof link.attrs.href === 'string' && href === null) href = link.attrs.href
  })
  return href
}

export function SelectionToolbar({ active, containsInteractionTarget, copy, dismissedSelectionRef, interactionOpen = false, onCommand, onLink, store }: SelectionToolbarProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const [position, setPosition] = useState<Position>(null)
  const selected = Boolean(
    snapshot.state
    && snapshot.state.selection instanceof TextSelection
    && !snapshot.state.selection.empty
    && snapshot.state.selection.$from.parent.inlineContent
    && snapshot.state.selection.$to.parent.inlineContent,
  )
  const key = selected ? selectionKey(snapshot.from, snapshot.to) : null
  const visible = Boolean(active && selected && key !== dismissedSelectionRef.current && position)

  useLayoutEffect(() => {
    const view = snapshot.view
    if (!active || !view || !selected) {
      setPosition(null)
      return undefined
    }

    const update = () => {
      frameRef.current = 0
      const toolbar = rootRef.current
      if (!toolbar || !view.dom.isConnected) {
        setPosition(null)
        return
      }
      try {
        const start = view.coordsAtPos(snapshot.from)
        const end = view.coordsAtPos(snapshot.to)
        const selectionTop = Math.min(start.top, end.top)
        const selectionBottom = Math.max(start.bottom, end.bottom)
        const selectionLeft = Math.min(start.left, end.left)
        const selectionRight = Math.max(start.right, end.right)
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const toolbarRect = toolbar.getBoundingClientRect()
        const gap = 8
        const edge = 8

        // A fully off-screen selection is no longer a useful contextual
        // anchor.  Keep the selection intact, but leave no detached toolbar.
        if (selectionBottom < 0 || selectionTop > viewportHeight || selectionRight < 0 || selectionLeft > viewportWidth) {
          setPosition(null)
          return
        }

        const centeredLeft = (selectionLeft + selectionRight) / 2 - toolbarRect.width / 2
        const left = Math.min(Math.max(edge, centeredLeft), Math.max(edge, viewportWidth - toolbarRect.width - edge))
        const above = selectionTop - toolbarRect.height - gap
        const top = above >= edge ? above : Math.min(viewportHeight - toolbarRect.height - edge, selectionBottom + gap)
        setPosition((current) => current?.left === left && current.top === top ? current : { left, top })
      } catch {
        setPosition(null)
      }
    }
    const schedule = () => {
      if (!frameRef.current) frameRef.current = requestAnimationFrame(update)
    }
    const stage = view.dom.closest<HTMLElement>('.document-stage')
    schedule()
    stage?.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    window.visualViewport?.addEventListener('resize', schedule, { passive: true })
    window.visualViewport?.addEventListener('scroll', schedule, { passive: true })
    return () => {
      stage?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [active, selected, snapshot.from, snapshot.state, snapshot.to, snapshot.view])

  useEffect(() => {
    if (!active) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || interactionOpen || !key) return
      dismissedSelectionRef.current = key
      setPosition(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, dismissedSelectionRef, interactionOpen, key])

  useEffect(() => {
    if (!active) return undefined
    const onFocusIn = (event: FocusEvent) => {
      if (!key || containsInteractionTarget(event.target)) return
      dismissedSelectionRef.current = key
      setPosition(null)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [active, containsInteractionTarget, dismissedSelectionRef, key])

  if (!selected || !snapshot.state || !visible) return <div ref={rootRef} className="selection-toolbar selection-toolbar--measuring" aria-hidden="true" />

  const press = (command: 'bold' | 'italic' | 'strike' | 'inline-code') => onCommand(command)
  return (
    <div ref={rootRef} className="selection-toolbar" role="toolbar" aria-label={copy.formattingToolbar} style={position ?? undefined}>
      <ToolbarButton label={copy.bold} pressed={hasMark('strong', snapshot.state)} onClick={() => press('bold')}><Bold /></ToolbarButton>
      <ToolbarButton label={copy.italic} pressed={hasMark('emphasis', snapshot.state)} onClick={() => press('italic')}><Italic /></ToolbarButton>
      <ToolbarButton label={copy.strike} pressed={hasMark('strike_through', snapshot.state)} onClick={() => press('strike')}><Strikethrough /></ToolbarButton>
      <ToolbarButton label={copy.inlineCode} pressed={hasMark('inlineCode', snapshot.state)} onClick={() => press('inline-code')}><Code2 /></ToolbarButton>
      <span className="selection-toolbar__divider" aria-hidden="true" />
      <ToolbarButton label={copy.link} pressed={Boolean(linkHref(snapshot.state))} onClick={() => onLink(position!)}><Link2 /></ToolbarButton>
    </div>
  )
}

function ToolbarButton({ children, label, onClick, pressed }: { children: React.ReactNode; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button aria-label={label} aria-pressed={pressed} type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
}

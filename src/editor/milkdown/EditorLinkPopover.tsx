import { Link2, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EditorSelectionSnapshot } from './editorCommands'

export type EditorLinkPopoverCopy = {
  apply: string
  cancel: string
  insert: string
  link: string
  linkAddress: string
  linkText: string
  removeLink: string
}

export type LinkPopoverMode = 'create-from-selection' | 'insert' | 'edit'

type EditorLinkPopoverProps = {
  canRemove: boolean
  copy: EditorLinkPopoverCopy
  href: string
  hrefValid: boolean
  mode: LinkPopoverMode
  text: string
  onApply: () => void
  onCancel: () => void
  onHrefChange: (href: string) => void
  onTextChange: (text: string) => void
  onRemove: () => void
  position: { left: number; top: number } | null
  selection: EditorSelectionSnapshot
}

export function EditorLinkPopover({ canRemove, copy, href, hrefValid, mode, text, onApply, onCancel, onHrefChange, onRemove, onTextChange, position, selection }: EditorLinkPopoverProps) {
  const rootRef = useRef<HTMLFormElement>(null)
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(position)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !position) return
    const rect = root.getBoundingClientRect()
    const edge = 8
    const left = Math.min(Math.max(edge, position.left - rect.width / 2), Math.max(edge, window.innerWidth - rect.width - edge))
    const top = Math.min(Math.max(edge, position.top + 44), Math.max(edge, window.innerHeight - rect.height - edge))
    setPlacement({ left, top })
  }, [position])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onCancel()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onCancel])

  return (
    <form
      ref={rootRef}
      className="editor-link-popover editor-link-popover--contextual"
      role="dialog"
      aria-label={copy.link}
      onSubmit={(event) => {
        event.preventDefault()
        onApply()
      }}
      // Retain the editor selection while buttons are pressed; the input is
      // allowed to take focus and the immutable snapshot restores it on apply.
      onMouseDown={(event) => {
        if (event.target instanceof HTMLButtonElement) event.preventDefault()
      }}
      data-selection-from={selection.from}
      data-selection-to={selection.to}
      style={placement ?? undefined}
    >
      {mode === 'insert' ? (
        <>
          <label>{copy.linkText}<input autoFocus aria-label={copy.linkText} value={text} onChange={(event) => onTextChange(event.target.value)} /></label>
          <label>{copy.linkAddress}<input aria-label={copy.linkAddress} placeholder="https://" type="url" value={href} onChange={(event) => onHrefChange(event.target.value)} /></label>
        </>
      ) : <><Link2 aria-hidden="true" size={15} /><input autoFocus aria-label={copy.linkAddress} placeholder="https://" type="url" value={href} onChange={(event) => onHrefChange(event.target.value)} /></>}
      <button type="submit" disabled={!hrefValid}>{mode === 'insert' ? copy.insert : copy.apply}</button>
      {canRemove ? <button aria-label={copy.removeLink} type="button" onClick={onRemove}><Trash2 aria-hidden="true" size={15} /></button> : null}
      <button type="button" onClick={onCancel}>{copy.cancel}</button>
    </form>
  )
}

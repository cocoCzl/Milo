import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { EditorCopy } from './editorCopy'

export function DocumentFindBar({
  copy,
  query,
  count,
  current,
  onQuery,
  onMove,
  onClose,
}: {
  copy: EditorCopy
  query: string
  count: number
  current: number
  onQuery: (query: string) => void
  onMove: (direction: number) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  return (
    <div
      className="document-find"
      role="search"
      aria-label={copy.find}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          onMove(event.shiftKey ? -1 : 1)
        }
      }}
    >
      <input
        ref={inputRef}
        aria-label={copy.find}
        placeholder={copy.find}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
      />
      <output aria-live="polite">
        {count ? current + 1 : 0} / {count}
      </output>
      <button
        type="button"
        disabled={!count}
        aria-label={copy.findPrevious}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={15} />
      </button>
      <button type="button" disabled={!count} aria-label={copy.findNext} onClick={() => onMove(1)}>
        <ArrowDown size={15} />
      </button>
      <button type="button" aria-label={copy.closeFind} onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  )
}

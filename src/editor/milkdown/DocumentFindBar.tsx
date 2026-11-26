import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { EditorCopy } from './editorCopy'

export function DocumentFindBar({
  copy,
  query,
  count,
  current,
  busy = false,
  onQuery,
  onMove,
  onClose,
  onReplace,
  onMatchCase,
}: {
  copy: EditorCopy
  query: string
  count: number
  current: number
  busy?: boolean
  onQuery: (query: string) => void
  onMove: (direction: number) => void
  onReplace?: (text: string, all: boolean) => void
  onMatchCase?: (value: boolean) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  return (
    <div
      className="document-find"
      role="search"
      aria-label={copy.find}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
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
      {onMatchCase ? (
        <button
          type="button"
          aria-label={copy.matchCase}
          aria-pressed={matchCase}
          onClick={() => {
            if (!composing.current) {
              setMatchCase(!matchCase)
              onMatchCase(!matchCase)
            }
          }}
        >
          Aa
        </button>
      ) : null}
      <output aria-live="polite" aria-busy={busy} aria-label={busy ? copy.findBusy : undefined}>
        {busy ? '…' : `${count ? current + 1 : 0} / ${count}`}
      </output>
      <button
        type="button"
        disabled={busy || !count}
        aria-label={copy.findPrevious}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={15} />
      </button>
      <button
        type="button"
        disabled={busy || !count}
        aria-label={copy.findNext}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={15} />
      </button>
      {onReplace ? (
        <div className="document-find__replace">
          <input
            aria-label={copy.replace}
            placeholder={copy.replace}
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || !count}
            onClick={() => {
              if (!composing.current) onReplace(replacement, false)
            }}
          >
            {copy.replace}
          </button>
          <button
            type="button"
            disabled={busy || !count}
            onClick={() => {
              if (!composing.current) onReplace(replacement, true)
            }}
          >
            {copy.replaceAll}
          </button>
        </div>
      ) : null}
      <button type="button" aria-label={copy.closeFind} onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  )
}

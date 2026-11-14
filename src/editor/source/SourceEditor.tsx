import { useEffect, useRef, useState } from 'react'
import type { EditorComposition } from '../milkdown/compositionSaveBoundary'

// Native textarea: no second parser, renderer, dependency, or editable model.
// It owns the source while active; every stable publication uses the ordinary
// session/save pipeline. Switching editor modes establishes an undo boundary.
export function SourceEditor({
  active,
  text,
  label,
  findLabel,
  onChange,
  onComposition,
  onRegisterFlush,
}: {
  active: boolean
  text: string
  label: string
  findLabel: string
  onChange: (text: string) => void
  onComposition: (state: EditorComposition) => void
  onRegisterFlush: (flush: (() => boolean) | null) => void
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const composing = useRef(false)
  const pending = useRef(false)
  const lastPublished = useRef(text.replace(/\r\n?/g, '\n'))
  const callbacks = useRef({ onChange, onComposition })
  callbacks.current = { onChange, onComposition }
  const timer = useRef<number | undefined>(undefined)
  const [query, setQuery] = useState<string | null>(null)
  const flush = useRef<() => boolean>(() => false)
  flush.current = () => {
    if (composing.current || pending.current || !input.current) return false
    const value = input.current.value
    if (value !== lastPublished.current) {
      lastPublished.current = value
      callbacks.current.onChange(value)
    }
    return true
  }
  useEffect(() => {
    onRegisterFlush(() => flush.current())
    return () => {
      onRegisterFlush(null)
      window.clearTimeout(timer.current)
    }
  }, [onRegisterFlush])
  useEffect(() => {
    if (!active || !input.current) return
    const normalized = text.replace(/\r\n?/g, '\n')
    if (input.current.value !== normalized) {
      input.current.value = normalized
    }
    lastPublished.current = normalized
    input.current.focus()
    // Only resynchronize at mode entry; own publications never reset the native
    // undo/selection or replace text during a composition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
  useEffect(() => {
    if (!active) {
      setQuery(null)
      return
    }
    const find = (event: Event) => {
      event.preventDefault()
      setQuery('')
    }
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && !event.isComposing)
        find(event)
    }
    window.addEventListener('milo:find', find)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('milo:find', find)
      window.removeEventListener('keydown', key)
    }
  }, [active])
  const settle = () => {
    let previous = input.current?.value
    let stable = 0
    const sample = () => {
      if (composing.current || !input.current) return
      if (input.current.value === previous) stable++
      else {
        previous = input.current.value
        stable = 0
      }
      if (stable >= 2) {
        pending.current = false
        flush.current()
        callbacks.current.onComposition({ phase: 'settled', markdown: input.current.value })
      } else timer.current = window.setTimeout(sample, 20)
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(sample, 20)
  }
  const findNext = () => {
    if (!query || !input.current) return
    const field = input.current
    const index = field.value.indexOf(query, field.selectionEnd)
    const found = index < 0 ? field.value.indexOf(query) : index
    if (found >= 0) {
      field.focus()
      field.setSelectionRange(found, found + query.length)
    }
  }
  return (
    <div className="source-editor" hidden={!active}>
      {query !== null ? (
        <div className="source-find" role="search">
          <input
            autoFocus
            aria-label={findLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return
              if (event.key === 'Enter') {
                event.preventDefault()
                findNext()
              }
              if (event.key === 'Escape') {
                event.stopPropagation()
                setQuery(null)
                input.current?.focus()
              }
            }}
          />
          <button type="button" onClick={findNext}>
            ↓
          </button>
          <button
            type="button"
            aria-label="Escape"
            onClick={() => {
              setQuery(null)
              input.current?.focus()
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      <textarea
        ref={input}
        aria-label={label}
        defaultValue={text}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        readOnly={!active}
        onChange={() => {
          if (!composing.current && !pending.current) flush.current()
        }}
        onCompositionStart={() => {
          window.clearTimeout(timer.current)
          composing.current = true
          pending.current = true
          callbacks.current.onComposition({ phase: 'composing' })
        }}
        onCompositionEnd={() => {
          composing.current = false
          settle()
        }}
      />
    </div>
  )
}

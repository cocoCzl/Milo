import * as Dialog from '@radix-ui/react-dialog'
import { flushSync } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  collectFolderFiles,
  filterFolderFiles,
  folderCandidates,
  type FolderSearchBatch,
  type FolderMatch,
} from '../file-system/folderSearch'

type QuickOpenError = { kind: 'scan'; message: string } | { kind: 'open'; path: string }

export function QuickOpen({
  folder,
  label,
  placeholder,
  loading,
  limited,
  retry,
  noResults,
  rootLabel,
  keyboardHint,
  openFailed,
  scanFailed,
  formatScanError,
  partialSearch,
  cancelLabel,
  onClose,
  onClosed,
  onOpen,
}: {
  folder: string
  label: string
  placeholder: string
  loading: string
  limited: string
  retry: string
  noResults: string
  rootLabel: string
  keyboardHint: string
  openFailed: string
  scanFailed: string
  formatScanError?: (reason: unknown) => string
  partialSearch: string
  cancelLabel: string
  onClose: () => void
  onClosed?: (opened: boolean) => void
  onOpen: (path: string, options: { signal: AbortSignal; reportError: false }) => Promise<boolean>
}) {
  const [query, setQuery] = useState('')
  const [chunks, setChunks] = useState<FolderMatch[][]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<QuickOpenError | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [incomplete, setIncomplete] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const openRequest = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const opened = useRef(false)
  const focusRestored = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    openRequest.current?.abort()
    openRequest.current = null
    setOpening(null)
    setBusy(true)
    setError(null)
    setIncomplete(false)
    setTruncated(false)
    setChunks([])
    const batches: FolderMatch[][] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    let publishedFiles = false
    let dirty = false
    let incomplete = false
    const commit = () => {
      timer = undefined
      if (controller.signal.aborted || !dirty) return
      // Only copy chunk references. Candidate objects/arrays are immutable.
      setChunks(batches.slice())
      setIncomplete(incomplete)
      publishedFiles = batches.length > 0
      dirty = false
    }
    const publish = (result: FolderSearchBatch) => {
      if (controller.signal.aborted) return
      if (result.files.length) batches.push(result.files)
      dirty ||= result.files.length > 0 || incomplete !== result.incomplete
      incomplete = result.incomplete
      // The first usable batch is immediate; later updates share a short window.
      if (!publishedFiles) commit()
      else if (dirty) timer ??= setTimeout(commit, 50)
    }
    void collectFolderFiles(folder, controller.signal, publish)
      .then((result) => {
        if (controller.signal.aborted) return
        clearTimeout(timer)
        dirty ||= incomplete !== result.incomplete
        incomplete = result.incomplete
        commit()
        setTruncated(result.truncated)
        setBusy(false)
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          clearTimeout(timer)
          setError({ kind: 'scan', message: String(reason) })
          setBusy(false)
        }
      })
    return () => {
      controller.abort()
      clearTimeout(timer)
      openRequest.current?.abort()
    }
  }, [folder, attempt])
  const matches = useMemo(() => filterFolderFiles(folderCandidates(chunks), query), [chunks, query])
  const current = Math.max(
    0,
    matches.findIndex((file) => file.path === selectedPath),
  )
  const selected = matches[current]
  const retryScan = () => {
    setAttempt((n) => n + 1)
    // The retry button disappears on success; retain a usable keyboard target.
    inputRef.current?.focus()
  }
  // Relevance can reorder streamed results; retain the selected path while it
  // remains in the best 100, never an unstable index.
  useEffect(() => {
    if (selected) setSelectedPath(selected.path)
  }, [selected])
  const close = () => {
    opened.current = false
    openRequest.current?.abort()
    // Remove the modal focus trap before returning focus. Radix's deferred
    // unmount autofocus can otherwise run after the next keystroke.
    flushSync(onClose)
    focusRestored.current = true
    onClosed?.(false)
  }
  const open = async (path: string) => {
    if (openRequest.current && !openRequest.current.signal.aborted) return
    const request = new AbortController()
    openRequest.current = request
    setOpening(path)
    setError(null)
    let success = false
    try {
      success = await onOpen(path, { signal: request.signal, reportError: false })
    } catch {
      // The session normally returns false; keep this boundary safe for callers.
    }
    if (request.signal.aborted || openRequest.current !== request) return
    openRequest.current = null
    setOpening(null)
    if (success) {
      opened.current = true
      onClose()
    } else setError({ kind: 'open', path })
  }
  useEffect(() => {
    if (selected)
      document.getElementById(`quick-file-${current}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [current, selected])
  return (
    <Dialog.Root
      open
      onOpenChange={(value) => {
        if (!value) close()
      }}
    >
      <Dialog.Portal container={document.querySelector<HTMLElement>('.app-shell')}>
        <Dialog.Overlay className="quick-open-backdrop" />
        <Dialog.Content
          className="quick-open"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!focusRestored.current) onClosed?.(opened.current)
          }}
        >
          <Dialog.Title>{label}</Dialog.Title>
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-label={label}
            aria-controls="quick-files"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={selected ? `quick-file-${current}` : undefined}
            value={query}
            placeholder={placeholder}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedPath(null)
              if (listRef.current) listRef.current.scrollTop = 0
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) {
                if (event.key === 'Escape') event.stopPropagation()
                return
              }
              if (
                event.key === 'ArrowDown' ||
                event.key === 'ArrowUp' ||
                event.key === 'Home' ||
                event.key === 'End'
              ) {
                event.preventDefault()
                const index =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? matches.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            matches.length - 1,
                            current + (event.key === 'ArrowDown' ? 1 : -1),
                          ),
                        )
                setSelectedPath(matches[index]?.path ?? null)
              }
              if (event.key === 'Enter' && selected) {
                event.preventDefault()
                void open(selected.path)
              }
            }}
          />
          {busy ? <p role="status">{loading}</p> : null}
          {opening ? (
            <p role="status">
              {loading} · {opening.split('/').at(-1)}
            </p>
          ) : null}
          {error ? (
            <div className="quick-open__error" role="alert">
              <span>
                {error.kind === 'scan'
                  ? `${scanFailed} · ${formatScanError ? formatScanError(error.message) : error.message}`
                  : `${openFailed}: ${error.path}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (error.kind === 'open') void open(error.path)
                  else retryScan()
                }}
              >
                {retry}
              </button>
            </div>
          ) : null}
          {incomplete ? (
            <div className="quick-open__partial" role="status">
              {partialSearch}
              <button type="button" onClick={retryScan}>
                {retry}
              </button>
            </div>
          ) : null}
          {!busy && !error && !incomplete && !truncated && !matches.length ? (
            <p role="status">{noResults}</p>
          ) : null}
          {truncated ? <p role="status">{limited}</p> : null}
          <div ref={listRef} id="quick-files" role="listbox" aria-label={label}>
            {matches.map((file, index) => (
              <button
                key={file.path}
                id={`quick-file-${index}`}
                role="option"
                aria-selected={current === index}
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSelectedPath(file.path)
                  void open(file.path)
                }}
              >
                <strong>{file.name}</strong>
                <small>
                  {file.relativePath.includes('/')
                    ? file.relativePath.slice(0, file.relativePath.lastIndexOf('/'))
                    : rootLabel}
                </small>
              </button>
            ))}
          </div>
          <p className="quick-open__hint">{keyboardHint}</p>
          <Dialog.Close className="quick-open__close" aria-label={cancelLabel}>
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

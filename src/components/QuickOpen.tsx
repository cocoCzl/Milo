import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useState } from 'react'
import {
  collectFolderFiles,
  filterFolderFiles,
  type FolderMatch,
} from '../file-system/folderSearch'

export function QuickOpen({
  folder,
  label,
  placeholder,
  loading,
  limited,
  retry,
  noResults,
  onClose,
  onOpen,
}: {
  folder: string
  label: string
  placeholder: string
  loading: string
  limited: string
  retry: string
  noResults: string
  onClose: () => void
  onOpen: (path: string) => Promise<boolean>
}) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<FolderMatch[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [current, setCurrent] = useState(0)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setBusy(true)
    setError(null)
    void collectFolderFiles(folder, controller.signal)
      .then((result) => {
        setFiles(result.files)
        setTruncated(result.truncated)
        setBusy(false)
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(String(reason))
          setBusy(false)
        }
      })
    return () => controller.abort()
  }, [folder, attempt])
  const matches = useMemo(() => filterFolderFiles(files, query), [files, query])
  const open = async (path: string) => {
    if (await onOpen(path)) onClose()
    else setError(path)
  }
  useEffect(() => {
    document.getElementById(`quick-file-${current}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [current])
  return (
    <Dialog.Root
      open
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <Dialog.Portal container={document.querySelector<HTMLElement>('.app-shell')}>
        <Dialog.Overlay className="quick-open-backdrop" />
        <Dialog.Content className="quick-open" aria-describedby={undefined}>
          <Dialog.Title>{label}</Dialog.Title>
          <input
            autoFocus
            role="combobox"
            aria-label={label}
            aria-controls="quick-files"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={matches[current] ? `quick-file-${current}` : undefined}
            value={query}
            placeholder={placeholder}
            onChange={(event) => {
              setQuery(event.target.value)
              setCurrent(0)
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) {
                if (event.key === 'Escape') event.stopPropagation()
                return
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setCurrent((index) =>
                  Math.max(
                    0,
                    Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
                  ),
                )
              }
              if (event.key === 'Enter' && matches[current]) {
                event.preventDefault()
                void open(matches[current].path)
              }
            }}
          />
          {busy ? <p role="status">{loading}</p> : null}
          {error ? (
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              {error} · {retry}
            </button>
          ) : null}
          {!busy && !error && !matches.length ? <p role="status">{noResults}</p> : null}
          {truncated ? <p role="status">{limited}</p> : null}
          <div id="quick-files" role="listbox" aria-label={label}>
            {matches.map((file, index) => (
              <button
                key={file.path}
                id={`quick-file-${index}`}
                role="option"
                aria-selected={current === index}
                type="button"
                onClick={() => void open(file.path)}
              >
                <strong>{file.name}</strong>
                <small>{file.relativePath}</small>
              </button>
            ))}
          </div>
          <Dialog.Close className="quick-open__close" aria-label="Escape">
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

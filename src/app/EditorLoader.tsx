import { useEffect, useState, type ComponentProps } from 'react'
import type { MilkdownEditor } from '../editor/milkdown/MilkdownEditor'

type Editor = typeof MilkdownEditor
let pending: Promise<Editor> | undefined
const load = () =>
  (pending ??= import('../editor/milkdown/MilkdownEditor')
    .then((m) => m.MilkdownEditor)
    .catch((error) => {
      pending = undefined
      throw error
    }))

// An explicit loader permits retry after a transient chunk failure (React.lazy
// caches a rejected promise). No editor import runs on an empty Home screen.
export function EditorLoader(
  props: ComponentProps<Editor> & { loadingLabel: string; retryLabel: string },
) {
  const { loadingLabel, retryLabel, ...editorProps } = props
  const [Editor, setEditor] = useState<Editor | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let disposed = false
    void load()
      .then((component) => {
        if (!disposed) setEditor(() => component)
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })
    return () => {
      disposed = true
    }
  }, [attempt])
  if (Editor) return <Editor {...editorProps} />
  return (
    <div className="document-loading" role={failed ? 'alert' : 'status'}>
      {failed ? (
        <button
          type="button"
          onClick={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        >
          {retryLabel}
        </button>
      ) : (
        loadingLabel
      )}
    </div>
  )
}

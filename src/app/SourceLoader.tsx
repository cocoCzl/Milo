import { useEffect, useState, type ComponentProps } from 'react'
import type { SourceEditor } from '../editor/source/SourceEditor'
let pending: Promise<typeof SourceEditor> | undefined
export function SourceLoader(
  props: ComponentProps<typeof SourceEditor> & { loadingLabel: string; retryLabel: string },
) {
  const { loadingLabel, retryLabel, ...editorProps } = props
  const [Editor, setEditor] = useState<typeof SourceEditor | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let disposed = false
    pending ??= import('../editor/source/SourceEditor')
      .then((m) => m.SourceEditor)
      .catch((error) => {
        pending = undefined
        throw error
      })
    void pending
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
    <div role={failed ? 'alert' : 'status'}>
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

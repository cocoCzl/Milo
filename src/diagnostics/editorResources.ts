import { Plugin } from '@milkdown/prose/state'
import type { EditorView, NodeViewConstructor } from '@milkdown/prose/view'
import { profilingEnabled } from './profileClock'

type Resource = 'editorViews' | 'imageViews' | 'codeViews' | 'tableViews'
type Counts = { created: number; destroyed: number; live: number }
const resources: Partial<Record<Resource, Counts>> = {}
const observedViews = new WeakSet<EditorView>()

// Only numbers are retained, never views, nodes, states, listeners or histories.
export function trackEditorResource(kind: Resource) {
  if (!profilingEnabled()) return () => undefined
  const counts = (resources[kind] ??= { created: 0, destroyed: 0, live: 0 })
  counts.created++
  counts.live++
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    counts.destroyed++
    counts.live--
  }
}

export function editorResourceCounts() {
  return structuredClone(resources)
}

export function editorResourcePlugins() {
  if (!profilingEnabled()) return []
  return [
    new Plugin({
      view(view) {
        // Plugin views also restart on reconfiguration. Count the actual
        // EditorView instance and its destroy method, not plugin teardown.
        if (!observedViews.has(view)) {
          observedViews.add(view)
          const release = trackEditorResource('editorViews')
          const destroy = view.destroy
          view.destroy = () => {
            try {
              destroy.call(view)
            } finally {
              release()
            }
          }
        }
        return {}
      },
    }),
  ]
}

export function profileNodeView(
  kind: Exclude<Resource, 'editorViews'>,
  create: NodeViewConstructor,
) {
  if (!profilingEnabled()) return create
  return ((...args) => {
    const nodeView = create(...args)
    const release = trackEditorResource(kind)
    const destroy = nodeView.destroy
    nodeView.destroy = () => {
      try {
        destroy?.call(nodeView)
      } finally {
        release()
      }
    }
    return nodeView
  }) satisfies NodeViewConstructor
}

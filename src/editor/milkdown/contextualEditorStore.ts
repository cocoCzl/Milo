import { Plugin } from '@milkdown/prose/state'
import type { EditorState } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'

export type ContextualSelectionState = {
  view: EditorView | null
  state: EditorState | null
  from: number
  to: number
}

const emptyState: ContextualSelectionState = { view: null, state: null, from: 0, to: 0 }

export class ContextualEditorStore {
  private listeners = new Set<() => void>()
  private snapshot = emptyState

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(view: EditorView) {
    const { from, to } = view.state.selection
    if (this.snapshot.view === view && this.snapshot.state === view.state && this.snapshot.from === from && this.snapshot.to === to) return
    this.snapshot = { view, state: view.state, from, to }
    this.listeners.forEach((listener) => listener())
  }

  clear() {
    if (this.snapshot === emptyState) return
    this.snapshot = emptyState
    this.listeners.forEach((listener) => listener())
  }
}

// The plugin is intentionally observer-only: no decoration, no transaction,
// and no document mutation.  It bridges ProseMirror's local selection lifecycle
// to the overlay without waking the App shell or other document tabs.
export function createContextualEditorPlugin(store: ContextualEditorStore) {
  return new Plugin({
    view(view) {
      store.update(view)
      return {
        update(nextView) {
          store.update(nextView)
        },
        destroy() {
          store.clear()
        },
      }
    },
  })
}

import type { EditorView } from '@milkdown/prose/view'

const focusTargets = new WeakMap<HTMLElement, EditorView>()

export function registerEditorFocusTarget(editorView: EditorView) {
  focusTargets.set(editorView.dom, editorView)
  return () => focusTargets.delete(editorView.dom)
}

export function focusEditorElement(target: HTMLElement) {
  const editorView = focusTargets.get(target)
  if (editorView) focusEditorViewPreservingSelection(editorView)
  else target.focus()
}

export function focusEditorViewPreservingSelection(editorView: EditorView) {
  editorView.focus()
  if (!editorView.editable) editorView.dom.focus({ preventScroll: true })
}

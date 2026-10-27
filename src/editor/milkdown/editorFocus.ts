import type { EditorView } from '@milkdown/prose/view'

export function focusEditorViewPreservingSelection(editorView: EditorView) {
  editorView.focus()
  if (!editorView.editable) editorView.dom.focus({ preventScroll: true })
}

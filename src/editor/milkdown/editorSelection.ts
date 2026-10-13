import { NodeSelection, TextSelection } from '@milkdown/prose/state'
import { CellSelection } from '@milkdown/prose/tables'
import type { EditorView } from '@milkdown/prose/view'
import type { EditorSelectionSnapshot } from './editorCommands'

export type ContextMenuSelection = {
  hasSelection: boolean
  inTable: boolean
  link: boolean
  selection: EditorSelectionSnapshot | null
}

export function syncProseMirrorSelectionFromDOM(editorView: EditorView): boolean {
  if (
    editorView.state.selection instanceof CellSelection ||
    editorView.state.selection instanceof NodeSelection
  )
    return true

  const domSelection = editorView.dom.ownerDocument.getSelection()

  if (
    !domSelection?.anchorNode ||
    !domSelection.focusNode ||
    !editorView.dom.contains(domSelection.anchorNode) ||
    !editorView.dom.contains(domSelection.focusNode)
  )
    return false

  try {
    const selection = TextSelection.between(
      editorView.state.doc.resolve(
        editorView.posAtDOM(domSelection.anchorNode, domSelection.anchorOffset),
      ),
      editorView.state.doc.resolve(
        editorView.posAtDOM(domSelection.focusNode, domSelection.focusOffset),
      ),
    )

    if (!selection.eq(editorView.state.selection)) {
      editorView.dispatch(editorView.state.tr.setSelection(selection))
    }
    return true
  } catch {
    // A browser can briefly expose a DOM selection while replacing a node.
    // A Link operation must never guess from a previous editor selection.
    return false
  }
}

// A contextmenu event is too late to trust WebKit's DOM Range: on macOS a
// secondary click over a collapsed caret can temporarily expand that Range to
// a word or block. ProseMirror has already synchronized genuine mouse
// selections through the editor's mouseup path, so the editor state is the
// authoritative context-menu selection and must be read without dispatching.
export function readContextMenuSelection(editorView: EditorView): ContextMenuSelection {
  const selection = editorView.state.selection
  const snapshot: EditorSelectionSnapshot = {
    doc: editorView.state.doc,
    from: selection.from,
    to: selection.to,
    text: editorView.state.doc.textBetween(selection.from, selection.to, '\n', '\n'),
  }
  const link = selection.$from.marks().some((mark) => mark.type.name === 'link')
  let inTable = false
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    if (selection.$from.node(depth).type.name === 'table') {
      inTable = true
      break
    }
  }
  return { hasSelection: !selection.empty, inTable, link, selection: snapshot }
}

export function linkHrefAtSelection(selection: EditorSelectionSnapshot): string | null {
  const link = selection.doc.type.schema.marks.link
  if (!link) return null
  let href: string | null = null
  selection.doc.nodesBetween(selection.from, selection.to, (node) => {
    const mark = link.isInSet(node.marks)
    if (mark && typeof mark.attrs.href === 'string' && href === null) href = mark.attrs.href
  })
  return href
}

import { redoDepth, undoDepth } from '@milkdown/prose/history'
import type { EditorState } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import {
  inputTraceEnabled,
  inputTraceVersion,
  isScopedInputTarget,
  scopedInputText,
  traceInput,
} from '../../diagnostics/inputTrace'

type Fields = Record<string, string | number | boolean | null>

// Explicit diagnostics and the existing exact disposable-file scope only.
// Hashes cover model text, not DOM text. Never read a private document for logs.
export function traceFind(
  view: EditorView,
  phase: string,
  fields: Fields = {},
  state: EditorState = view.state,
) {
  if (!inputTraceEnabled || !isScopedInputTarget(view.dom)) return
  const text = state.doc.textContent
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  const focused = view.dom.ownerDocument.activeElement
  traceInput(`find:${phase}`, {
    ...fields,
    docVersion: inputTraceVersion(state.doc),
    modelLength: text.length,
    modelHash: (hash >>> 0).toString(16),
    modelText: scopedInputText(true, text),
    undoDepth: undoDepth(state),
    redoDepth: redoDepth(state),
    selectionFrom: state.selection.from,
    selectionTo: state.selection.to,
    focus:
      focused === view.dom
        ? 'editor'
        : focused?.closest('.document-find')
          ? `find:${focused.tagName}:${focused.getAttribute('aria-label') ?? ''}`
          : (focused?.tagName ?? ''),
  })
}

export function observeFindKeys(view: EditorView) {
  if (!inputTraceEnabled) return () => {}
  const owner = view.dom.ownerDocument
  const observe = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element) || view.dom.closest('.document-panel[hidden]')) return
    const key = event as KeyboardEvent
    const input = event as InputEvent
    if (
      event.type === 'keydown' &&
      !((key.metaKey || key.ctrlKey) && key.code === 'KeyZ') &&
      key.key !== 'Escape'
    )
      return
    if (event.type === 'beforeinput' && !['historyUndo', 'historyRedo'].includes(input.inputType))
      return
    traceFind(view, `event:${event.type}`, {
      key: key.code ?? '',
      inputType: input.inputType ?? '',
      prevented: event.defaultPrevented,
      shift: key.shiftKey ?? false,
    })
  }
  for (const type of ['keydown', 'beforeinput', 'focusin', 'focusout'])
    owner.addEventListener(type, observe)
  return () => {
    for (const type of ['keydown', 'beforeinput', 'focusin', 'focusout'])
      owner.removeEventListener(type, observe)
  }
}

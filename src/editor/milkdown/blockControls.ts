import { TextSelection, type EditorState } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import type { EditorSelectionSnapshot } from './editorCommands'

export type BlockMenuCommand =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'blockquote'
  | 'bullet-list'
  | 'ordered-list'
  | 'code-block'
  | 'table'
  | 'divider'

export type BlockTarget = {
  editorId: string
  doc: EditorState['doc']
  targetBlockPosition: number
  selection: EditorSelectionSnapshot
  blockType: BlockMenuCommand
  rect: { left: number; top: number; right: number; bottom: number }
}

function targetBlockType($position: ReturnType<EditorState['doc']['resolve']>, depth: number): BlockMenuCommand {
  let listType: BlockMenuCommand | null = null
  let quoted = false
  for (let currentDepth = depth; currentDepth > 0; currentDepth -= 1) {
    const node = $position.node(currentDepth)
    if (node.type.name === 'bullet_list') listType = 'bullet-list'
    if (node.type.name === 'ordered_list') listType = 'ordered-list'
    if (node.type.name === 'blockquote') quoted = true
  }
  if (listType) return listType
  if (quoted) return 'blockquote'

  const node = $position.node(depth)
  if (node.type.name === 'heading') {
    const level = Number(node.attrs.level)
    if (level >= 1 && level <= 3) return `heading-${level}` as BlockMenuCommand
  }
  if (node.type.name === 'code_block') return 'code-block'
  return 'paragraph'
}

function blockElement(view: EditorView, position: number): HTMLElement | null {
  const node = view.nodeDOM(position)
  if (node instanceof HTMLElement) return node
  const dom = view.domAtPos(position).node
  return dom instanceof HTMLElement ? dom.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li') : dom.parentElement?.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li') ?? null
}

// Purely reads an existing block. It does not dispatch, focus, or alter the
// DOM selection: opening and hovering the Block UI are non-edit operations.
export function blockTargetAtPosition(view: EditorView, editorId: string, position: number): BlockTarget | null {
  const state = view.state
  const bounded = Math.max(0, Math.min(position, state.doc.content.size))
  const $position = state.doc.resolve(bounded)
  let blockDepth = $position.depth
  while (blockDepth > 0 && !$position.node(blockDepth).isTextblock) blockDepth -= 1
  if (blockDepth === 0) return null

  const targetBlockPosition = $position.before(blockDepth)
  const selection = TextSelection.near(state.doc.resolve(Math.min(targetBlockPosition + 1, state.doc.content.size)), 1)
  const element = blockElement(view, targetBlockPosition)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null

  return {
    editorId,
    doc: state.doc,
    targetBlockPosition,
    selection: {
      doc: state.doc,
      from: selection.from,
      to: selection.to,
      text: state.doc.textBetween(selection.from, selection.to, '\n', '\n'),
    },
    blockType: targetBlockType($position, blockDepth),
    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
  }
}

export function blockTargetAtCoords(view: EditorView, editorId: string, coords: { left: number; top: number }): BlockTarget | null {
  const found = view.posAtCoords(coords)
  return found ? blockTargetAtPosition(view, editorId, found.pos) : null
}

export function isValidBlockTarget(state: EditorState, editorId: string, target: BlockTarget) {
  if (target.editorId !== editorId || state.doc !== target.doc) return false
  if (target.targetBlockPosition < 0 || target.targetBlockPosition >= state.doc.content.size) return false
  const node = state.doc.nodeAt(target.targetBlockPosition)
  if (!node?.isTextblock) return false
  return target.selection.from >= 0
    && target.selection.to >= target.selection.from
    && target.selection.to <= state.doc.content.size
    && state.doc.textBetween(target.selection.from, target.selection.to, '\n', '\n') === target.selection.text
}

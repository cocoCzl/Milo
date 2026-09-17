import {
  createCodeBlockCommand,
  liftListItemCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark'
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/preset-gfm'
import { lift } from '@milkdown/prose/commands'
import { TextSelection, type Command, type EditorState } from '@milkdown/prose/state'
import type { CmdKey } from '@milkdown/core'
import { isExternalHttpUrl } from '../../file-system/externalLink'

export type EditorBlockKind = 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'blockquote' | 'code-block'

export type EditorSelectionSnapshot = {
  doc: EditorState['doc']
  from: number
  to: number
  text: string
}

export function isValidEditorSelectionSnapshot(state: EditorState, selection: EditorSelectionSnapshot) {
  return state.doc === selection.doc
    && selection.from >= 0
    && selection.to >= selection.from
    && selection.to <= state.doc.content.size
    && state.doc.textBetween(selection.from, selection.to, '\n', '\n') === selection.text
}

export type EditorCommandRunner = {
  runMilkdown: <T>(command: CmdKey<T>, payload?: T, selection?: EditorSelectionSnapshot) => boolean
  runProse: (command: Command, selection?: EditorSelectionSnapshot) => boolean
  readState: () => EditorState | null
}

function isInsideNode(state: EditorState | null, name: string) {
  if (!state) return false
  for (let depth = state.selection.$from.depth; depth > 0; depth -= 1) {
    if (state.selection.$from.node(depth).type.name === name) return true
  }
  return false
}

// This module deliberately translates UI intents to the existing Milkdown and
// ProseMirror commands only.  It never edits Markdown strings, owns no schema,
// and lets every mutation flow through the editor's normal transaction/history.
export function createEditorCommands(runner: EditorCommandRunner) {
  const setBlockKind = (kind: EditorBlockKind, selection?: EditorSelectionSnapshot) => {
    const state = runner.readState()
    if (kind === 'blockquote' && isInsideNode(state, 'blockquote')) {
      return runner.runProse(lift, selection)
    }
    if (kind !== 'blockquote' && isInsideNode(state, 'blockquote')) {
      runner.runProse(lift, selection)
    }

    switch (kind) {
      case 'paragraph': return runner.runMilkdown(turnIntoTextCommand.key, undefined, selection)
      case 'heading-1': return runner.runMilkdown(wrapInHeadingCommand.key, 1, selection)
      case 'heading-2': return runner.runMilkdown(wrapInHeadingCommand.key, 2, selection)
      case 'heading-3': return runner.runMilkdown(wrapInHeadingCommand.key, 3, selection)
      case 'blockquote': return runner.runMilkdown(wrapInBlockquoteCommand.key, undefined, selection)
      case 'code-block': return runner.runMilkdown(createCodeBlockCommand.key, undefined, selection)
    }
  }

  const toggleBulletList = (selection?: EditorSelectionSnapshot) => (
    isInsideNode(runner.readState(), 'bullet_list')
      ? runner.runMilkdown(liftListItemCommand.key, undefined, selection)
      : runner.runMilkdown(wrapInBulletListCommand.key, undefined, selection)
  )

  const toggleOrderedList = (selection?: EditorSelectionSnapshot) => (
    isInsideNode(runner.readState(), 'ordered_list')
      ? runner.runMilkdown(liftListItemCommand.key, undefined, selection)
      : runner.runMilkdown(wrapInOrderedListCommand.key, undefined, selection)
  )

  return {
    toggleBold: (selection?: EditorSelectionSnapshot) => runner.runMilkdown(toggleStrongCommand.key, undefined, selection),
    toggleItalic: (selection?: EditorSelectionSnapshot) => runner.runMilkdown(toggleEmphasisCommand.key, undefined, selection),
    toggleStrike: (selection?: EditorSelectionSnapshot) => runner.runMilkdown(toggleStrikethroughCommand.key, undefined, selection),
    toggleInlineCode: (selection?: EditorSelectionSnapshot) => runner.runMilkdown(toggleInlineCodeCommand.key, undefined, selection),
    // `toggleLinkCommand` removes an existing mark and Milkdown's update
    // command collapses the selection.  This transaction updates the exact
    // saved range for both new and existing links, while preserving selection
    // and all compatible marks (including inline code).
    applyLinkToSelection: (href: string, selection?: EditorSelectionSnapshot) => runner.runProse((state, dispatch) => {
      const link = state.schema.marks.link
      const { from, to } = state.selection
      if (!link || from === to || !isExternalHttpUrl(href)) return false
      let existingAttrs: Record<string, unknown> = {}
      state.doc.nodesBetween(from, to, (node) => {
        const mark = link.isInSet(node.marks)
        if (mark && Object.keys(existingAttrs).length === 0) existingAttrs = mark.attrs
      })
      dispatch?.(state.tr.removeMark(from, to, link).addMark(from, to, link.create({ ...existingAttrs, href })))
      return true
    }, selection),
    insertLink: (text: string, href: string, selection?: EditorSelectionSnapshot) => runner.runProse((state, dispatch) => {
      const link = state.schema.marks.link
      if (!link || !state.selection.empty || !text || !isExternalHttpUrl(href)) return false
      dispatch?.(state.tr.replaceSelectionWith(state.schema.text(text, [link.create({ href })]), false))
      return true
    }, selection),
    updateLink: (href: string, selection?: EditorSelectionSnapshot) => runner.runProse((state, dispatch) => {
      const link = state.schema.marks.link
      const { from, to } = state.selection
      if (!link || from === to || !isExternalHttpUrl(href) || !state.doc.rangeHasMark(from, to, link)) return false
      dispatch?.(state.tr.removeMark(from, to, link).addMark(from, to, link.create({ href })))
      return true
    }, selection),
    removeLink: (selection?: EditorSelectionSnapshot) => runner.runProse((state, dispatch) => {
      const link = state.schema.marks.link
      if (!link || state.selection.empty || !state.doc.rangeHasMark(state.selection.from, state.selection.to, link)) return false
      dispatch?.(state.tr.removeMark(state.selection.from, state.selection.to, link))
      return true
    }, selection),
    setBlockKind,
    setParagraph: (selection?: EditorSelectionSnapshot) => setBlockKind('paragraph', selection),
    setHeading1: (selection?: EditorSelectionSnapshot) => setBlockKind('heading-1', selection),
    setHeading2: (selection?: EditorSelectionSnapshot) => setBlockKind('heading-2', selection),
    setHeading3: (selection?: EditorSelectionSnapshot) => setBlockKind('heading-3', selection),
    setQuote: (selection?: EditorSelectionSnapshot) => setBlockKind('blockquote', selection),
    setCodeBlock: (selection?: EditorSelectionSnapshot) => setBlockKind('code-block', selection),
    toggleBulletList,
    toggleOrderedList,
    // Milkdown's stock insert-HR command adds a temporary empty paragraph for
    // its caret. That paragraph serializes as HTML `<br />`. Insert the same
    // schema node directly at the current textblock boundary instead: one
    // normal ProseMirror history transaction, no synthetic block.
    insertDivider: (selection?: EditorSelectionSnapshot) => runner.runProse((state, dispatch) => {
      const hr = state.schema.nodes.hr
      if (!hr) return false
      let depth = state.selection.$from.depth
      while (depth > 0 && !state.selection.$from.node(depth).isTextblock) depth -= 1
      if (!depth) return false
      const blockPosition = state.selection.$from.before(depth)
      const block = state.selection.$from.node(depth)
      const divider = hr.create()
      let transaction = block.content.size === 0
        ? state.tr.replaceWith(blockPosition, blockPosition + block.nodeSize, divider)
        : state.tr.insert(blockPosition, divider)
      const cursor = TextSelection.near(transaction.doc.resolve(Math.min(blockPosition + divider.nodeSize, transaction.doc.content.size)), 1)
      transaction = transaction.setSelection(cursor).scrollIntoView()
      dispatch?.(transaction)
      return true
    }, selection),
    insertTable: (selection?: EditorSelectionSnapshot) => runner.runMilkdown(insertTableCommand.key, { row: 3, col: 3 }, selection),
  }
}

export type EditorCommands = ReturnType<typeof createEditorCommands>

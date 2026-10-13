import { cleanup } from '@testing-library/react'

import { afterEach, describe, expect, it } from 'vitest'

import { NodeSelection, TextSelection } from '@milkdown/prose/state'
import { CellSelection } from '@milkdown/prose/tables'

import { readContextMenuSelection, syncProseMirrorSelectionFromDOM } from './editorSelection'
import { focusEditorViewPreservingSelection } from './editorFocus'
import {
  imageSelectionTestView,
  cellSelectionTestView,
  setDOMTextSelection,
  headingSelectionTestView,
} from './editorTestFixtures'

afterEach(cleanup)

describe('MilkdownEditor selection', () => {
  it('reads context-menu selection from PM state without importing WebKit transient DOM ranges', () => {
    const { mount, view } = headingSelectionTestView()
    try {
      const headingText = view.dom.querySelector('h1')!.firstChild as Text
      const paragraphText = view.dom.querySelector('p')!.firstChild as Text

      const paragraphCaret = TextSelection.create(view.state.doc, view.posAtDOM(paragraphText, 4))
      view.dispatch(view.state.tr.setSelection(paragraphCaret))
      setDOMTextSelection(paragraphText, 0, paragraphText.data.length)
      const paragraphMenu = readContextMenuSelection(view)
      expect(view.state.selection).toBe(paragraphCaret)
      expect(paragraphMenu.selection?.from).toBe(paragraphCaret.from)
      expect(paragraphMenu.selection?.to).toBe(paragraphCaret.to)
      expect(paragraphMenu.hasSelection).toBe(false)

      const headingCaret = TextSelection.create(
        view.state.doc,
        view.posAtDOM(headingText, headingText.data.length),
      )
      view.dispatch(view.state.tr.setSelection(headingCaret))
      setDOMTextSelection(headingText, 0, headingText.data.length)
      const headingMenu = readContextMenuSelection(view)
      expect(view.state.selection).toBe(headingCaret)
      expect(headingMenu.selection?.from).toBe(headingCaret.from)
      expect(headingMenu.selection?.to).toBe(headingCaret.to)
      expect(headingMenu.hasSelection).toBe(false)

      const textSelection = TextSelection.create(
        view.state.doc,
        view.posAtDOM(paragraphText, 0),
        view.posAtDOM(paragraphText, 9),
      )
      view.dispatch(view.state.tr.setSelection(textSelection))
      setDOMTextSelection(headingText, 0, headingText.data.length)
      const selectedMenu = readContextMenuSelection(view)
      expect(view.state.selection).toBe(textSelection)
      expect(selectedMenu.selection?.from).toBe(textSelection.from)
      expect(selectedMenu.selection?.to).toBe(textSelection.to)
      expect(selectedMenu.hasSelection).toBe(true)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('preserves a complete CellSelection through mouseup DOM-selection sync and clipboard serialization', () => {
    const { cellPositions, mount, view } = cellSelectionTestView()
    try {
      const selection = CellSelection.create(view.state.doc, cellPositions[8], cellPositions[0])
      view.dispatch(view.state.tr.setSelection(selection))
      const originalAnchor = selection.$anchorCell.pos
      const originalHead = selection.$headCell.pos
      const firstCellText = view.dom.querySelector('th p')!.firstChild as Text
      setDOMTextSelection(firstCellText, 0, firstCellText.data.length)

      expect(syncProseMirrorSelectionFromDOM(view)).toBe(true)
      expect(view.state.selection).toBeInstanceOf(CellSelection)
      expect((view.state.selection as CellSelection).$anchorCell.pos).toBe(originalAnchor)
      expect((view.state.selection as CellSelection).$headCell.pos).toBe(originalHead)
      expect(view.dom.querySelectorAll('.selectedCell')).toHaveLength(9)

      const clipboard = view.serializeForClipboard(view.state.selection.content()).text
      expect(clipboard).toContain('你好世界')
      expect(clipboard).toContain('E')
      expect(clipboard).toContain('I')
      expect(clipboard.trim()).not.toBe('你好世界')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('preserves the exact 2x2 CellSelection rectangle through mouseup sync and copy', () => {
    const { cellPositions, mount, view } = cellSelectionTestView()
    try {
      const selection = CellSelection.create(view.state.doc, cellPositions[8], cellPositions[4])
      view.dispatch(view.state.tr.setSelection(selection))
      const firstCellText = view.dom.querySelector('th p')!.firstChild as Text
      setDOMTextSelection(firstCellText, 0, firstCellText.data.length)

      expect(syncProseMirrorSelectionFromDOM(view)).toBe(true)
      expect(view.state.selection).toBeInstanceOf(CellSelection)
      expect((view.state.selection as CellSelection).$anchorCell.pos).toBe(cellPositions[8])
      expect((view.state.selection as CellSelection).$headCell.pos).toBe(cellPositions[4])
      expect(view.dom.querySelectorAll('.selectedCell')).toHaveLength(4)

      const clipboard = view.serializeForClipboard(view.state.selection.content()).text
      for (const selected of ['E', 'F', 'H', 'I']) expect(clipboard).toContain(selected)
      for (const outside of ['你好世界', 'B', 'C', 'D', 'G'])
        expect(clipboard).not.toContain(outside)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('still syncs ordinary paragraph and table-cell text selections after preserving CellSelection', () => {
    const { cellPositions, mount, view } = cellSelectionTestView()
    try {
      view.dispatch(
        view.state.tr.setSelection(
          CellSelection.create(view.state.doc, cellPositions[8], cellPositions[0]),
        ),
      )

      const cellText = view.dom.querySelector('th p')!.firstChild as Text
      const cellCursor = view.posAtDOM(cellText, 2)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cellCursor)))
      setDOMTextSelection(cellText, 0, 2)
      expect(syncProseMirrorSelectionFromDOM(view)).toBe(true)
      expect(view.state.selection).toBeInstanceOf(TextSelection)
      expect(view.state.selection.empty).toBe(false)
      expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe(
        '你好',
      )

      const paragraphText = view.dom.querySelector(':scope > p')!.firstChild as Text
      const paragraphCursor = view.posAtDOM(paragraphText, 0)
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, paragraphCursor)),
      )
      setDOMTextSelection(paragraphText, 0, 'Outside'.length)
      expect(syncProseMirrorSelectionFromDOM(view)).toBe(true)
      expect(view.state.selection).toBeInstanceOf(TextSelection)
      expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe(
        'Outside',
      )

      const collapsedCellCursor = view.posAtDOM(cellText, 1)
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, collapsedCellCursor)),
      )
      setDOMTextSelection(cellText, 1, 1)
      expect(syncProseMirrorSelectionFromDOM(view)).toBe(true)
      expect(view.state.selection).toBeInstanceOf(TextSelection)
      expect(view.state.selection.empty).toBe(true)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('restores EditorView focus without replacing TextSelection, CellSelection, or NodeSelection', () => {
    const table = cellSelectionTestView()
    const image = imageSelectionTestView()
    try {
      const paragraphPosition = table.view.posAtDOM(
        table.view.dom.querySelector(':scope > p')!.firstChild!,
        2,
      )
      const textSelection = TextSelection.create(
        table.view.state.doc,
        paragraphPosition,
        paragraphPosition + 3,
      )
      table.view.dispatch(table.view.state.tr.setSelection(textSelection))
      focusEditorViewPreservingSelection(table.view)
      expect(table.view.state.selection).toBe(textSelection)

      const cellSelection = CellSelection.create(
        table.view.state.doc,
        table.cellPositions[8],
        table.cellPositions[4],
      )
      table.view.dispatch(table.view.state.tr.setSelection(cellSelection))
      focusEditorViewPreservingSelection(table.view)
      expect(table.view.state.selection).toBe(cellSelection)
      expect(table.view.dom.querySelectorAll('.selectedCell')).toHaveLength(4)

      const nodeSelection = NodeSelection.create(image.view.state.doc, 1)
      image.view.dispatch(image.view.state.tr.setSelection(nodeSelection))
      focusEditorViewPreservingSelection(image.view)
      expect(image.view.state.selection).toBe(nodeSelection)
      expect(image.view.dom.querySelector('.local-image-view')).toHaveClass(
        'ProseMirror-selectednode',
      )

      const followingText = image.view.dom.querySelector('p')!.lastChild as Text
      setDOMTextSelection(followingText, followingText.data.length, followingText.data.length)
      expect(syncProseMirrorSelectionFromDOM(image.view)).toBe(true)
      expect(image.view.state.selection).toBe(nodeSelection)
    } finally {
      table.view.destroy()
      table.mount.remove()
      image.view.destroy()
      image.mount.remove()
    }
  })
})

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EditorContextMenu, type EditorContextMenuCopy } from './EditorContextMenu'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const copy: EditorContextMenuCopy = {
  addColumnLeft: 'Add column left',
  addColumnRight: 'Add column right',
  addRowAbove: 'Add row above',
  addRowBelow: 'Add row below',
  bold: 'Bold',
  copy: 'Copy',
  cut: 'Cut',
  deleteColumn: 'Delete column',
  deleteRow: 'Delete row',
  italic: 'Italic',
  addLink: 'Add link',
  editLink: 'Edit link',
  insertLink: 'Insert link',
  selectAll: 'Select all',
}

function renderMenu(options: { hasSelection?: boolean; inTable?: boolean } = {}) {
  const onCommand = vi.fn()
  const onDismiss = vi.fn()
  const onTableCommand = vi.fn()
  const ui = render(
    <EditorContextMenu
      copy={copy}
      hasSelection={options.hasSelection ?? false}
      inTable={options.inTable ?? false}
      linkLabel={copy.insertLink}
      position={{ left: 12, top: 20 }}
      onCommand={onCommand}
      onDismiss={onDismiss}
      onTableCommand={onTableCommand}
    />,
  )
  return { ...ui, onCommand, onDismiss, onTableCommand }
}

describe('EditorContextMenu keyboard semantics', () => {
  it('focuses the first enabled item and skips disabled items in both directions', () => {
    const ui = renderMenu()
    const cut = ui.getByRole('menuitem', { name: /Cut/ })
    const copyItem = ui.getByRole('menuitem', { name: /Copy/ })
    const bold = ui.getByRole('menuitem', { name: /Bold/ })
    const selectAll = ui.getByRole('menuitem', { name: /Select all/ })

    expect(cut).toBeDisabled()
    expect(cut).toHaveAttribute('aria-disabled', 'true')
    expect(copyItem).toBeDisabled()
    expect(bold).toHaveFocus()

    fireEvent.keyDown(bold, { key: 'ArrowUp' })
    expect(selectAll).toHaveFocus()
    fireEvent.keyDown(selectAll, { key: 'ArrowDown' })
    expect(bold).toHaveFocus()
  })

  it('supports Arrow keys, Home, and End with wrap-around', () => {
    const ui = renderMenu({ hasSelection: true })
    const cut = ui.getByRole('menuitem', { name: /Cut/ })
    const copyItem = ui.getByRole('menuitem', { name: /Copy/ })
    const selectAll = ui.getByRole('menuitem', { name: /Select all/ })

    expect(cut).toHaveFocus()
    fireEvent.keyDown(cut, { key: 'ArrowDown' })
    expect(copyItem).toHaveFocus()
    fireEvent.keyDown(copyItem, { key: 'End' })
    expect(selectAll).toHaveFocus()
    fireEvent.keyDown(selectAll, { key: 'ArrowDown' })
    expect(cut).toHaveFocus()
    fireEvent.keyDown(cut, { key: 'ArrowUp' })
    expect(selectAll).toHaveFocus()
    fireEvent.keyDown(selectAll, { key: 'Home' })
    expect(cut).toHaveFocus()
  })

  it('activates the focused item with Enter or Space', () => {
    const enter = renderMenu({ hasSelection: true })
    fireEvent.keyDown(enter.getByRole('menuitem', { name: /Cut/ }), { key: 'Enter' })
    expect(enter.onCommand).toHaveBeenCalledWith('cut')
    enter.unmount()

    const space = renderMenu({ inTable: true })
    const addRow = space.getByRole('menuitem', { name: 'Add row above' })
    addRow.focus()
    fireEvent.keyDown(addRow, { key: ' ' })
    expect(space.onTableCommand).toHaveBeenCalledWith('row-before')
  })

  it('dismisses on Escape without activating an item', () => {
    const ui = renderMenu({ hasSelection: true })
    fireEvent.keyDown(ui.getByRole('menuitem', { name: /Cut/ }), { key: 'Escape' })
    expect(ui.onDismiss).toHaveBeenCalledOnce()
    expect(ui.onCommand).not.toHaveBeenCalled()
  })
})

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'

import { afterEach, describe, expect, it } from 'vitest'

import { blockTargetAtPosition } from './blockControls'
import { MilkdownEditor } from './MilkdownEditor'

afterEach(cleanup)

describe('MilkdownEditor tables', () => {
  it('runs table Context Menu commands through the existing command chain with Undo and Redo', async () => {
    const source = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const { container, getByRole } = render(<MilkdownEditor initialMarkdown={source} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const cell = editor.querySelector<HTMLElement>('td p')!
    const range = document.createRange()
    range.selectNodeContents(cell)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.contextMenu(cell, { clientX: 120, clientY: 160 })
    fireEvent.click(getByRole('menuitem', { name: 'Add row below' }))
    await waitFor(() => expect(editor.querySelectorAll('tr')).toHaveLength(3))
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(editor.querySelectorAll('tr')).toHaveLength(2))
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(editor.querySelectorAll('tr')).toHaveLength(3))
  })

  it('renders GFM task lists and tables in the editing surface', async () => {
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={
          '- [ ] Shape the draft\n\n| Area | State |\n| --- | --- |\n| Editor | Ready |'
        }
      />,
    )

    await waitFor(() => {
      expect(
        container.querySelector('li[data-item-type="task"][data-checked="false"]'),
      ).toBeInTheDocument()
      expect(container.querySelector('table')).toBeInTheDocument()
    })

    const wrapper = container.querySelector<HTMLElement>('.ProseMirror > .tableWrapper')!
    const table = wrapper.querySelector<HTMLTableElement>(':scope > table')!
    expect(wrapper).toBeInTheDocument()
    expect(table.querySelector(':scope > colgroup')).toBeInTheDocument()
    expect(table.querySelector(':scope > tbody')).toBeInTheDocument()
    expect(table.querySelector('thead')).not.toBeInTheDocument()
    expect(table.querySelector('tbody > tr[data-is-header="true"] > th > p')).toHaveTextContent(
      'Area',
    )
    expect(table.querySelector('tbody > tr:not([data-is-header]) > td > p')).toHaveTextContent(
      'Editor',
    )
    expect(wrapper.querySelector('.column-resize-handle')).not.toBeInTheDocument()
    expect(container.querySelector('.ProseMirror.resize-cursor')).not.toBeInTheDocument()
  })

  it('keeps standard table node views mounted across modes and isolated between editors', async () => {
    const markdown = '| A | B |\n| --- | --- |\n| one | two |'
    const first = render(<MilkdownEditor initialMarkdown={markdown} presentationMode="edit" />)
    const second = render(<MilkdownEditor initialMarkdown={markdown} presentationMode="edit" />)

    const firstWrapper = await waitFor(() => {
      const element = first.container.querySelector<HTMLElement>('.ProseMirror > .tableWrapper')
      expect(element).toBeInTheDocument()
      return element!
    })
    const firstTable = firstWrapper.querySelector(':scope > table')
    const secondWrapper = await waitFor(() => {
      const element = second.container.querySelector<HTMLElement>('.ProseMirror > .tableWrapper')
      expect(element).toBeInTheDocument()
      return element!
    })

    expect(secondWrapper).not.toBe(firstWrapper)
    first.rerender(<MilkdownEditor initialMarkdown={markdown} presentationMode="read" />)

    await waitFor(() => {
      expect(first.container.querySelector('.ProseMirror')).toHaveAttribute(
        'contenteditable',
        'false',
      )
      expect(first.container.querySelector('.ProseMirror > .tableWrapper')).toBe(firstWrapper)
      expect(firstWrapper.querySelector(':scope > table')).toBe(firstTable)
    })
    expect(second.container.querySelector('.ProseMirror')).toHaveAttribute(
      'contenteditable',
      'true',
    )
    expect(second.container.querySelector('.ProseMirror > .tableWrapper')).toBe(secondWrapper)
    first.unmount()
    second.unmount()
  })

  it('anchors a table BlockTarget to its stable TableView wrapper without changing its semantic target', async () => {
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'First\n\n| A | B |\n| --- | --- |\n| one | two |\n\nThird'}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const wrapper = editor.querySelector<HTMLElement>(':scope > .tableWrapper')!
    const table = wrapper.querySelector<HTMLTableElement>(':scope > table')!
    const cellParagraph = table.querySelector<HTMLElement>('td > p')!
    const pmDoc = (
      editor as HTMLElement & {
        pmViewDesc?: {
          node?: {
            descendants: (
              callback: (
                node: { type: { name: string } },
                position: number,
                parent: { type: { name: string } } | null,
              ) => boolean | void,
            ) => void
            nodeAt: (position: number) => { type: { name: string } } | null
            resolve: (position: number) => unknown
            content: { size: number }
            textBetween: (
              from: number,
              to: number,
              blockSeparator?: string,
              leafText?: string,
            ) => string
          }
        }
      }
    ).pmViewDesc?.node
    expect(pmDoc).toBeDefined()

    let tablePosition = -1
    let cellParagraphPosition = -1
    pmDoc?.descendants((node, position, parent) => {
      if (node.type.name === 'table') tablePosition = position
      if (
        cellParagraphPosition < 0 &&
        node.type.name === 'paragraph' &&
        parent?.type.name === 'table_cell'
      ) {
        cellParagraphPosition = position
      }
    })
    expect(tablePosition).toBeGreaterThanOrEqual(0)
    expect(cellParagraphPosition).toBeGreaterThan(tablePosition)

    let scrollLeft = 0
    Object.defineProperty(wrapper, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (next: number) => {
        scrollLeft = next
      },
    })
    Object.defineProperty(wrapper, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(100, 200, 500, 400),
    })
    Object.defineProperty(table, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(100 - scrollLeft, 200, 1200, 400),
    })
    const fakeView = {
      state: { doc: pmDoc },
      nodeDOM: (position: number) => {
        if (position === tablePosition) return wrapper
        if (position === cellParagraphPosition) return cellParagraph
        return null
      },
      domAtPos: () => ({ node: editor }),
    } as unknown as Parameters<typeof blockTargetAtPosition>[0]

    const leftTarget = blockTargetAtPosition(fakeView, 'table-anchor', cellParagraphPosition + 1)!
    wrapper.scrollLeft = 350
    const middleTarget = blockTargetAtPosition(fakeView, 'table-anchor', cellParagraphPosition + 1)!
    wrapper.scrollLeft = 700
    const rightTarget = blockTargetAtPosition(fakeView, 'table-anchor', cellParagraphPosition + 1)!

    expect([leftTarget.rect.left, middleTarget.rect.left, rightTarget.rect.left]).toEqual([
      100, 100, 100,
    ])
    expect(leftTarget.rect).toEqual({ left: 100, top: 200, right: 600, bottom: 600 })
    expect(middleTarget).toMatchObject({
      editorId: leftTarget.editorId,
      doc: leftTarget.doc,
      targetBlockPosition: leftTarget.targetBlockPosition,
      selection: leftTarget.selection,
      blockType: 'table',
      containerBlockPosition: leftTarget.containerBlockPosition,
      insertAfterPosition: leftTarget.insertAfterPosition,
    })
    expect(rightTarget).toMatchObject({
      targetBlockPosition: leftTarget.targetBlockPosition,
      selection: leftTarget.selection,
      containerBlockPosition: leftTarget.containerBlockPosition,
      insertAfterPosition: leftTarget.insertAfterPosition,
    })

    const legacyView = {
      ...fakeView,
      nodeDOM: (position: number) =>
        position === tablePosition
          ? table
          : position === cellParagraphPosition
            ? cellParagraph
            : null,
    } as unknown as Parameters<typeof blockTargetAtPosition>[0]
    wrapper.scrollLeft = 0
    expect(
      blockTargetAtPosition(legacyView, 'legacy-table', cellParagraphPosition + 1)?.rect.left,
    ).toBe(100)
  })

  it('toggles a task when its visual checkbox is clicked', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="- [ ] Shape the draft" />)

    const taskItem = await waitFor(() => {
      const item = container.querySelector<HTMLElement>('li[data-item-type="task"]')
      expect(item).toBeInTheDocument()
      return item
    })

    fireEvent.click(taskItem!, { clientX: 0 })

    await waitFor(() => {
      expect(container.querySelector('li[data-item-type="task"]')).toHaveAttribute(
        'data-checked',
        'true',
      )
    })
  })
})

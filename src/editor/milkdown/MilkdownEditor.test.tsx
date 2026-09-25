import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Schema } from '@milkdown/prose/model'
import { EditorState, TextSelection } from '@milkdown/prose/state'
import { CellSelection, tableEditing, tableNodes } from '@milkdown/prose/tables'
import { EditorView } from '@milkdown/prose/view'

import { blockTargetAtPosition } from './blockControls'
import { createImageNodeView, MilkdownEditor, syncProseMirrorSelectionFromDOM } from './MilkdownEditor'

afterEach(cleanup)

function longOutlineMarkdown() {
  return Array.from({ length: 20 }, (_, index) => `## ${index + 1}. Chapter ${index + 1}\n\nContent for chapter ${index + 1}.`).join('\n\n')
}

function proseMirrorDocJSON(editor: HTMLElement) {
  return (editor as HTMLElement & { pmViewDesc?: { node?: { toJSON: () => unknown } } }).pmViewDesc?.node?.toJSON()
}

function localImageNodeViewTestHarness(source: string, alt = '', title = '') {
  const schema = new Schema({
    nodes: {
      doc: { content: 'paragraph+' },
      paragraph: { content: 'inline*', toDOM: () => ['p', 0] },
      image: {
        inline: true,
        group: 'inline',
        atom: true,
        attrs: { src: { default: '' }, alt: { default: '' }, title: { default: '' } },
        toDOM: (node) => ['img', node.attrs],
      },
      text: { group: 'inline' },
    },
  })
  const imageNode = (src: string, nextAlt = alt, nextTitle = title) => schema.nodes.image.create({ src, alt: nextAlt, title: nextTitle })
  const constructor = createImageNodeView(
    { current: '/documents/note.md' },
    { current: { loadImageError: 'Could not load image — try again' } } as unknown as Parameters<typeof createImageNodeView>[1],
  )
  const view = constructor(imageNode(source), {} as EditorView, () => 1, [], {} as never)
  document.body.append(view.dom)
  return { imageNode, view }
}

function cellSelectionTestView() {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
      text: { group: 'inline' },
      ...tableNodes({ tableGroup: 'block', cellContent: 'paragraph+', cellAttributes: {} }),
    },
  })
  const paragraph = (text: string) => schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
  const cell = (text: string, header = false) => schema.nodes[header ? 'table_header' : 'table_cell'].create(null, paragraph(text))
  const rows = [
    ['你好世界', 'B', 'C'],
    ['D', 'E', 'F'],
    ['G', 'H', 'I'],
  ].map((values, row) => schema.nodes.table_row.create(null, values.map((value) => cell(value, row === 0))))
  const doc = schema.nodes.doc.create(null, [
    paragraph('Outside paragraph'),
    schema.nodes.table.create(null, rows),
  ])
  const mount = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(mount, {
    state: EditorState.create({ doc, plugins: [tableEditing()] }),
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction))
    },
  })
  const cellPositions: number[] = []
  doc.descendants((node, position) => {
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') cellPositions.push(position)
  })
  return { cellPositions, mount, view }
}

function setDOMTextSelection(node: Text, from: number, to: number) {
  const range = document.createRange()
  range.setStart(node, from)
  range.setEnd(node, to)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
}

async function openBlockMenu(overlayMount: HTMLElement) {
  const handle = await within(overlayMount).findByRole('button', { name: 'Add block' })
  fireEvent.click(handle)
  return within(overlayMount)
}

function setStageGeometry(
  stage: HTMLElement,
  container: HTMLElement,
  scrollTo: ReturnType<typeof vi.fn>,
  initialScrollTop = 0,
  landingOffset = 0,
) {
  let scrollTop = initialScrollTop
  const documentYByHeading = new Map(
    Array.from(container.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')).map((heading, index) => [heading, 120 + index * 100]),
  )

  Object.defineProperties(stage, {
    clientHeight: { configurable: true, get: () => 500 },
    scrollHeight: { configurable: true, get: () => 2200 },
    scrollTop: { configurable: true, get: () => scrollTop, set: (next: number) => { scrollTop = next } },
  })
  Object.defineProperty(stage, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 100, 800, 500) })
  documentYByHeading.forEach((documentY, heading) => {
    Object.defineProperty(heading, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 100 + documentY - scrollTop, 600, 32),
    })
  })
  Object.defineProperty(stage, 'scrollTo', {
    configurable: true,
    value: (options: ScrollToOptions) => {
      scrollTop = Number(options.top ?? 0) + landingOffset
      scrollTo(options)
    },
  })
}

describe('MilkdownEditor', () => {
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
      for (const outside of ['你好世界', 'B', 'C', 'D', 'G']) expect(clipboard).not.toContain(outside)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('still syncs ordinary paragraph and table-cell text selections after preserving CellSelection', () => {
    const { cellPositions, mount, view } = cellSelectionTestView()
    try {
      view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cellPositions[8], cellPositions[0])))

      const cellText = view.dom.querySelector('th p')!.firstChild as Text
      const cellCursor = view.posAtDOM(cellText, 2)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cellCursor)))
      setDOMTextSelection(cellText, 0, 2)
      expect(syncProseMirrorSelectionFromDOM(view)).toBe(true)
      expect(view.state.selection).toBeInstanceOf(TextSelection)
      expect(view.state.selection.empty).toBe(false)
      expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe('你好')

      const paragraphText = view.dom.querySelector(':scope > p')!.firstChild as Text
      const paragraphCursor = view.posAtDOM(paragraphText, 0)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, paragraphCursor)))
      setDOMTextSelection(paragraphText, 0, 'Outside'.length)
      expect(syncProseMirrorSelectionFromDOM(view)).toBe(true)
      expect(view.state.selection).toBeInstanceOf(TextSelection)
      expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe('Outside')

      const collapsedCellCursor = view.posAtDOM(cellText, 1)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, collapsedCellCursor)))
      setDOMTextSelection(cellText, 1, 1)
      expect(syncProseMirrorSelectionFromDOM(view)).toBe(true)
      expect(view.state.selection).toBeInstanceOf(TextSelection)
      expect(view.state.selection.empty).toBe(true)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it.each([4, 5, 6])('converts only the frozen first block to H%i, with history and Markdown round-trip', async (level) => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown={'第一段\n\n第二段\n\n第三段'} contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />)
    const menu = await openBlockMenu(overlayMount)
    const editor = container.querySelector<HTMLElement>('.ProseMirror')!
    const neighbors = Array.from(editor.children).slice(1).map((node) => node.outerHTML)
    fireEvent.pointerEnter(menu.getByRole('menuitem', { name: 'More Headings' }))
    fireEvent.pointerMove(editor.children[1], { clientX: 300, clientY: 220 })
    fireEvent.pointerMove(editor.children[2], { clientX: 300, clientY: 300 })
    fireEvent.click(menu.getByRole('menuitemradio', { name: `Heading ${level}` }))
    await waitFor(() => expect(editor.firstElementChild?.tagName).toBe(`H${level}`))
    expect(Array.from(editor.children).slice(1).map((node) => node.outerHTML)).toEqual(neighbors)
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    const saved = onMarkdownChange.mock.calls.at(-1)![0] as string
    expect(saved.trim()).toBe(`${'#'.repeat(level)} 第一段\n\n第二段\n\n第三段`)
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(editor.firstElementChild?.tagName).toBe('P'))
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(editor.firstElementChild?.tagName).toBe(`H${level}`))
    expect(Array.from(editor.children).slice(1).map((node) => node.outerHTML)).toEqual(neighbors)
    const reopened = render(<MilkdownEditor initialMarkdown={saved} />)
    await waitFor(() => expect(reopened.container.querySelector(`h${level}`)).toHaveTextContent('第一段'))
    expect(proseMirrorDocJSON(reopened.container.querySelector('.ProseMirror')!)).toEqual(proseMirrorDocJSON(editor))
    reopened.unmount()
    overlayMount.remove()
  })

  it.each([4, 5, 6])('recognizes parsed H%i and supports heading/body conversions without changing neighbors', async (initialLevel) => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown={`${'#'.repeat(initialLevel)} 标题\n\n第二段\n\n第三段`} contextualOverlayMount={overlayMount} />)
    let current = initialLevel
    for (const next of [4, 5, 6, 0, 1, 4, 2, 5, 3, 6, 5, 4, 0]) {
      const menu = await openBlockMenu(overlayMount)
      const more = menu.getByRole('menuitem', { name: 'More Headings' })
      fireEvent.click(more)
      const label = current === 0 ? 'Body text' : `Heading ${current}`
      expect(menu.getByRole('menuitemradio', { name: label })).toHaveAttribute('aria-checked', 'true')
      if (current >= 4) {
        expect(more).toHaveClass('block-menu__more--active')
        expect(menu.getByRole('menuitemradio', { name: 'Body text' })).toHaveAttribute('aria-checked', 'false')
      }
      fireEvent.click(menu.getByRole('menuitemradio', { name: next === 0 ? 'Body text' : `Heading ${next}` }))
      await waitFor(() => expect(container.querySelector('.ProseMirror')?.firstElementChild?.tagName).toBe(next ? `H${next}` : 'P'))
      expect(Array.from(container.querySelector('.ProseMirror')!.children).slice(1).map((node) => node.outerHTML)).toEqual(['<p>第二段</p>', '<p>第三段</p>'])
      current = next
    }
    overlayMount.remove()
  })

  it('closes both menu levels on Read and does not restore them on Edit', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const props = { initialMarkdown: '#### 四级标题\n\n##### 五级标题\n\n###### 六级标题', contextualOverlayMount: overlayMount }
    const view = render(<MilkdownEditor {...props} />)
    const menu = await openBlockMenu(overlayMount)
    expect(Array.from(view.container.querySelector('.ProseMirror')!.children).map((node) => node.tagName)).toEqual(['H4', 'H5', 'H6'])
    fireEvent.click(menu.getByRole('menuitem', { name: 'More Headings' }))
    expect(menu.getAllByRole('menu')).toHaveLength(2)
    view.rerender(<MilkdownEditor {...props} presentationMode="read" />)
    await waitFor(() => expect(menu.queryByRole('menu')).not.toBeInTheDocument())
    view.rerender(<MilkdownEditor {...props} presentationMode="edit" />)
    await within(overlayMount).findByRole('button', { name: 'Add block' })
    expect(menu.queryByRole('menu')).not.toBeInTheDocument()
    overlayMount.remove()
  })

  it('serializes and reparses a document containing all three lower heading levels', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const markdown = '#### 四级标题\n\n##### 五级标题\n\n###### 六级标题\n'
    const onMarkdownChange = vi.fn()
    const view = render(<MilkdownEditor initialMarkdown={markdown} contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />)
    for (const level of [5, 4]) {
      const menu = await openBlockMenu(overlayMount)
      fireEvent.click(menu.getByRole('menuitem', { name: 'More Headings' }))
      fireEvent.click(menu.getByRole('menuitemradio', { name: `Heading ${level}` }))
      await waitFor(() => expect(view.container.querySelector('.ProseMirror')?.firstElementChild?.tagName).toBe(`H${level}`))
    }
    await waitFor(() => expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toBe(markdown))
    const original = proseMirrorDocJSON(view.container.querySelector('.ProseMirror')!)
    view.unmount()
    const reopened = render(<MilkdownEditor initialMarkdown={onMarkdownChange.mock.calls.at(-1)![0]} />)
    await waitFor(() => expect(reopened.container.querySelector('h6')).toHaveTextContent('六级标题'))
    expect(Array.from(reopened.container.querySelector('.ProseMirror')!.children).map((node) => node.tagName)).toEqual(['H4', 'H5', 'H6'])
    expect(proseMirrorDocJSON(reopened.container.querySelector('.ProseMirror')!)).toEqual(original)
    overlayMount.remove()
  })

  it('mounts one editable ProseMirror surface', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="# A quiet page" />)

    await waitFor(() => {
      expect(container.firstElementChild).toHaveAttribute('aria-busy', 'false')
      expect(container.querySelector('.ProseMirror')).toHaveAttribute(
        'aria-label',
        'Untitled Markdown document',
      )
    })

    expect(container.querySelectorAll('.ProseMirror')).toHaveLength(1)
  })

  it('commits a Chinese IME composition without HTML or invisible-character pollution', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="输入前" onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild as Text
    const selection = window.getSelection()!
    const range = document.createRange()
    range.setStart(text, text.data.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    fireEvent.compositionStart(editor, { data: '' })
    text.data += '中文输入'
    fireEvent.input(editor, { data: '中文输入', inputType: 'insertCompositionText', isComposing: true })
    fireEvent.compositionEnd(editor, { data: '中文输入' })

    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved.trimEnd()).toBe('输入前中文输入')
    expect(saved).not.toMatch(/<br\s*\/?>/i)
    expect(saved).not.toContain('\u200b')
    expect(saved).not.toContain('\u00a0')
  })

  it('does not turn Safari composition replacement in an empty paragraph into a hardbreak', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'第一段测试文字\n\n第二段测试文字'}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const firstParagraph = editor.querySelector<HTMLElement>(':scope > p:first-child')!
    const initialRange = document.createRange()
    initialRange.setStart(firstParagraph.firstChild!, 0)
    initialRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(initialRange)
    fireEvent.keyDown(editor, { key: 'Enter' })

    const titleParagraph = editor.querySelector<HTMLElement>(':scope > p:first-child')!
    fireEvent.compositionStart(editor, { data: '' })
    titleParagraph.textContent = 'biao ti'
    const composingText = titleParagraph.firstChild!
    const composingRange = document.createRange()
    composingRange.setStart(composingText, composingText.textContent?.length ?? 0)
    composingRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(composingRange)
    fireEvent.input(editor, { data: 'biao ti', inputType: 'insertCompositionText', isComposing: true })

    fireEvent(editor, new InputEvent('beforeinput', {
      bubbles: true,
      data: null,
      inputType: 'deleteCompositionText',
      isComposing: true,
    }))
    // WKWebView replaces the entire composing paragraph with a bare BR that is
    // temporarily a direct child of the ProseMirror root. ProseMirror only
    // recreates the paragraph and its trailing-break DOM hack after parsing.
    const artifactBreak = document.createElement('br')
    titleParagraph.replaceWith(artifactBreak)
    const deletionRange = document.createRange()
    deletionRange.setStart(editor, 0)
    deletionRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(deletionRange)

    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
      ],
    }))
    fireEvent.input(editor, { data: null, inputType: 'deleteCompositionText', isComposing: true })

    const committedParagraph = editor.querySelector<HTMLElement>(':scope > p:first-child')!
    committedParagraph.innerHTML = '标题<br class="ProseMirror-trailingBreak">'
    const committedText = committedParagraph.firstChild!
    const committedRange = document.createRange()
    committedRange.setStart(committedText, committedText.textContent?.length ?? 0)
    committedRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(committedRange)
    fireEvent(editor, new InputEvent('beforeinput', {
      bubbles: true,
      data: '标题',
      inputType: 'insertFromComposition',
      isComposing: true,
    }))
    fireEvent.input(editor, { data: '标题', inputType: 'insertFromComposition', isComposing: true })
    fireEvent.compositionEnd(editor, { data: '标题' })

    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '标题' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
      ],
    }))
    expect(editor.innerHTML).toBe('<p>标题</p><p>第一段测试文字</p><p>第二段测试文字</p>')
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('标题\n\n第一段测试文字\n\n第二段测试文字\n'))
  })

  it('preserves an authored Shift+Enter hardbreak through Markdown round-trip', async () => {
    const onMarkdownChange = vi.fn()
    const { container, rerender } = render(
      <MilkdownEditor key="editing" initialMarkdown="第一行" onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const paragraph = editor.querySelector('p')!
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })

    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: '第一行' },
          { type: 'hardbreak', attrs: { isInline: false } },
        ],
      }],
    }))
    expect(paragraph.innerHTML).toContain('data-type="hardbreak"')

    paragraph.innerHTML = '第一行<br data-type="hardbreak" data-is-inline="false">第二行'
    const secondLine = paragraph.lastChild!
    const secondLineRange = document.createRange()
    secondLineRange.setStart(secondLine, secondLine.textContent?.length ?? 0)
    secondLineRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(secondLineRange)
    fireEvent.input(editor, { data: '第二行', inputType: 'insertText' })

    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: '第一行' },
          { type: 'hardbreak', attrs: { isInline: false } },
          { type: 'text', text: '第二行' },
        ],
      }],
    }))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved).toMatch(/^第一行\\\n第二行\n$/)

    rerender(<MilkdownEditor key="reopened" initialMarkdown={saved} />)
    const reopened = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      expect(element).not.toBe(editor)
      return element!
    })
    await waitFor(() => expect(proseMirrorDocJSON(reopened)).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: '第一行' },
          { type: 'hardbreak', attrs: { isInline: false } },
          { type: 'text', text: '第二行' },
        ],
      }],
    }))
  })

  it('preserves a real br from pasted HTML', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="" />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const paragraph = editor.querySelector('p')!
    const range = document.createRange()
    range.setStart(paragraph, 0)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/html' ? '<p>第一行<br>第二行</p>' : '第一行\n第二行',
        types: ['text/html', 'text/plain'],
      },
    })
    editor.dispatchEvent(paste)

    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: '第一行' },
          { type: 'hardbreak', attrs: { isInline: false } },
          { type: 'text', text: '第二行' },
        ],
      }],
    }))
  })

  it('keeps Chinese composition inside a code block as code text', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown={'```\n\n```'} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const code = editor.querySelector<HTMLElement>('.code-block-card__content')!
    fireEvent.compositionStart(code, { data: '' })
    code.textContent = '中文代码'
    const range = document.createRange()
    range.selectNodeContents(code)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.input(code, { data: '中文代码', inputType: 'insertCompositionText', isComposing: true })
    fireEvent.compositionEnd(code, { data: '中文代码' })

    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [{
        type: 'code_block',
        attrs: { language: '' },
        content: [{ type: 'text', text: '中文代码' }],
      }],
    }))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('```\n中文代码\n```\n'))
  })

  it('keeps Chinese composition inside an empty table cell without a hardbreak', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'| 标题 |\n| --- |\n|  |'}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const cellParagraph = editor.querySelector<HTMLElement>('td p')!
    fireEvent.compositionStart(cellParagraph, { data: '' })
    cellParagraph.textContent = '中文单元格'
    const range = document.createRange()
    range.selectNodeContents(cellParagraph)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.input(cellParagraph, { data: '中文单元格', inputType: 'insertCompositionText', isComposing: true })
    fireEvent.compositionEnd(cellParagraph, { data: '中文单元格' })

    await waitFor(() => {
      const json = JSON.stringify(proseMirrorDocJSON(editor))
      expect(json).toContain('中文单元格')
      expect(json).not.toContain('hardbreak')
    })
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toContain('中文单元格')
  })

  it('keeps composition next to linked Chinese text without duplication', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="[百度](https://www.baidu.com/)"
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const linkText = editor.querySelector('a')!.firstChild as Text
    const range = document.createRange()
    range.setStart(linkText, linkText.data.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.compositionStart(editor, { data: '' })
    linkText.data += '标题'
    range.setStart(linkText, linkText.data.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.input(editor, { data: '标题', inputType: 'insertCompositionText', isComposing: true })
    fireEvent.compositionEnd(editor, { data: '标题' })

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('百度标题'))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('[百度标题](https://www.baidu.com/)\n'))
    expect(editor.textContent).toBe('百度标题')
    expect(editor.querySelector('br')).not.toBeInTheDocument()
  })

  it('switches read mode on the existing ProseMirror instance without remounting it', async () => {
    const { container, rerender } = render(<MilkdownEditor initialMarkdown="A stable document" presentationMode="edit" />)
    const proseMirror = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })

    rerender(<MilkdownEditor initialMarkdown="A stable document" presentationMode="read" />)

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBe(proseMirror)
      expect(proseMirror).toHaveAttribute('contenteditable', 'false')
      expect(proseMirror).toHaveAttribute('aria-readonly', 'true')
    })
    expect(container.querySelector('.editor-toolbar')).not.toBeInTheDocument()

    rerender(<MilkdownEditor initialMarkdown="A stable document" presentationMode="edit" />)
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBe(proseMirror)
      expect(proseMirror).toHaveAttribute('contenteditable', 'true')
      expect(proseMirror).toHaveAttribute('aria-readonly', 'false')
    })
  })

  it('shows local selection controls only for a non-empty edit-mode selection', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container, rerender } = render(
      <MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')!
      expect(element).toBeInTheDocument()
      return element
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    fireEvent.keyUp(editor, { key: 'Shift' })

    await waitFor(() => expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible())
    expect(within(overlayMount).getByRole('button', { name: 'Bold' })).toBeVisible()

    rerender(<MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} presentationMode="read" />)
    await waitFor(() => expect(within(overlayMount).queryByRole('toolbar', { name: 'Formatting' })).not.toBeInTheDocument())
    overlayMount.remove()
  })

  it('keeps the selection toolbar available for an ordinary text selection inside a table cell', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'| A | B |\n| --- | --- |\n| 你好世界 | other |'}
        contextualOverlayMount={overlayMount}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('td p')!.firstChild as Text
    setDOMTextSelection(text, 0, 2)
    fireEvent.mouseUp(editor)

    await waitFor(() => expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible())
    expect(editor.querySelectorAll('.selectedCell')).toHaveLength(0)
    overlayMount.remove()
  })

  it('keeps a selected range while applying several contextual inline commands', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    fireEvent.keyUp(editor, { key: 'Shift' })

    await waitFor(() => expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Bold' }))
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Italic' }))
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Strikethrough' }))

    await waitFor(() => {
      expect(editor.querySelector('strong')).toHaveTextContent('Select')
      expect(editor.querySelector('em')).toHaveTextContent('Select')
      expect(editor.querySelector('del')).toHaveTextContent('Select')
    })
    overlayMount.remove()
  })

  it('restores the selected range after link input takes focus', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    fireEvent.keyUp(editor, { key: 'Shift' })

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://milo.example' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(editor.querySelector('a')).toHaveAttribute('href', 'https://milo.example'))
    expect(editor.querySelector('a')).toHaveTextContent('Select')
    overlayMount.remove()
  })

  it('creates a link for freshly selected ordinary text without changing its paragraph', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="hello world" contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'hello'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('hello'))
    expect(editor.querySelector('p')).toHaveTextContent('hello world')
    expect(editor.querySelectorAll('p')).toHaveLength(1)
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('[hello](https://example.com) world\n'))
    overlayMount.remove()
  })

  it('creates a link for freshly selected Chinese text in place', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="这是一个测试链接" contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, '这是一个测试链接'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('测试链接'))
    expect(editor.querySelector('p')).toHaveTextContent('这是一个测试链接')
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('这是一个[测试链接](https://example.com)\n'))
    overlayMount.remove()
  })

  it('serializes a link mark without adding blocks, breaks, or a bare URL', async () => {
    const markdown = 'AJDBC 是 BPK DataBus 的客户端 JDBC 驱动。'
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown={markdown} contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'AJDBC'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://www.baidu.com/' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('AJDBC'))
    expect(editor.textContent).toBe(markdown)
    expect(editor.querySelectorAll('p')).toHaveLength(1)
    expect(editor.querySelector('br')).not.toBeInTheDocument()
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('[AJDBC](https://www.baidu.com/) 是 BPK DataBus 的客户端 JDBC 驱动。\n'))
    const serialized = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(serialized).not.toContain('<br />')
    expect(serialized).not.toContain('<https://www.baidu.com/>')
    overlayMount.remove()
  })

  it('inserts a link at a collapsed cursor through the Link shortcut', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown="before" contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const textInput = await within(overlayMount).findByRole('textbox', { name: 'Link text' })
    fireEvent.change(textInput, { target: { value: '百度' } })
    fireEvent.change(within(overlayMount).getByRole('textbox', { name: 'Link address' }), { target: { value: 'https://www.baidu.com/' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Insert' }))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('before[百度](https://www.baidu.com/)\n'))
    expect(editor.querySelectorAll('p')).toHaveLength(1)
    overlayMount.remove()
  })

  it('turns a pasted HTTP URL into a link at a collapsed cursor', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown="before" onMarkdownChange={onMarkdownChange} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.paste(editor, { clipboardData: { getData: () => 'https://www.baidu.com/' } })
    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('https://www.baidu.com/'))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('before<https://www.baidu.com/>\n'))
  })

  it('uses a pasted HTTP URL as the href instead of replacing a selected Chinese label', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown="百度搜索" onMarkdownChange={onMarkdownChange} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 2)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.paste(editor, { clipboardData: { getData: () => 'https://www.baidu.com/' } })

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('百度'))
    expect(editor.querySelector('p')).toHaveTextContent('百度搜索')
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('[百度](https://www.baidu.com/)搜索\n'))
  })

  it('leaves ordinary and unsafe URL paste to the normal editor paste path', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="before" />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    const plainPaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(plainPaste, 'clipboardData', { value: { getData: () => 'hello' } })
    editor.dispatchEvent(plainPaste)

    const unsafePaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(unsafePaste, 'clipboardData', { value: { getData: () => 'javascript:alert(1)' } })
    editor.dispatchEvent(unsafePaste)
    expect(editor.querySelector('a')).not.toBeInTheDocument()
  })

  it('uses the URL itself as text when Insert Link text is empty', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown="before" contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.change(await within(overlayMount).findByRole('textbox', { name: 'Link address' }), { target: { value: 'https://www.baidu.com/' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Insert' }))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('before<https://www.baidu.com/>\n'))
    overlayMount.remove()
  })

  it('opens Insert Link from the contextual menu using the saved collapsed cursor', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container, getByRole } = render(
      <MilkdownEditor initialMarkdown="before" contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.contextMenu(editor, { clientX: 120, clientY: 160 })
    fireEvent.click(getByRole('menuitem', { name: /Insert link/ }))
    fireEvent.change(await within(overlayMount).findByRole('textbox', { name: 'Link text' }), { target: { value: '百度' } })
    fireEvent.change(within(overlayMount).getByRole('textbox', { name: 'Link address' }), { target: { value: 'https://www.baidu.com/' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Insert' }))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('before[百度](https://www.baidu.com/)\n'))
    overlayMount.remove()
  })

  it('applies a link to an inline-code selection and serializes the link target', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="`db-auditor`" contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('code')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'db-auditor'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://www.baidu.com' } })
    expect(within(overlayMount).queryByRole('button', { name: 'Remove link' })).not.toBeInTheDocument()
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(editor.querySelector('a')).toHaveAttribute('href', 'https://www.baidu.com'))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('[`db-auditor`](https://www.baidu.com)\n'))
    overlayMount.remove()
  })

  it('updates and removes an existing link without removing its text', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="[hello](https://a.com)" contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('a')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'hello'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    expect(input).toHaveValue('https://a.com')
    expect(within(overlayMount).getByRole('button', { name: 'Remove link' })).toBeVisible()
    fireEvent.change(input, { target: { value: 'https://b.com' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(editor.querySelector('a')).toHaveAttribute('href', 'https://b.com'))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('[hello](https://b.com)\n'))

    const updatedText = editor.querySelector('a')!.firstChild!
    const updatedRange = document.createRange()
    updatedRange.setStart(updatedText, 0)
    updatedRange.setEnd(updatedText, 'hello'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(updatedRange)
    fireEvent.mouseUp(editor)
    fireEvent.keyUp(editor, { key: 'Shift' })
    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const remove = await within(overlayMount).findByRole('button', { name: 'Remove link' })
    fireEvent.click(remove)

    await waitFor(() => expect(editor.querySelector('a')).not.toBeInTheDocument())
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('hello\n'))
    overlayMount.remove()
  })

  it('cancels link editing without changing the Markdown document', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="hello" contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'hello'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://discard.example' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Cancel' }))

    expect(editor.querySelector('a')).not.toBeInTheDocument()
    expect(onMarkdownChange).not.toHaveBeenCalled()
    overlayMount.remove()
  })

  it('closes link editing before dismissing the selection toolbar on Escape', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    fireEvent.keyUp(editor, { key: 'Shift' })

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(within(overlayMount).queryByRole('dialog', { name: 'Link' })).not.toBeInTheDocument()
    expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(within(overlayMount).queryByRole('toolbar', { name: 'Formatting' })).not.toBeInTheDocument())
    overlayMount.remove()
  })

  it('guards task and code-language mutations in read mode while retaining code copy', async () => {
    const { container, getByRole, rerender } = render(
      <MilkdownEditor initialMarkdown={'- [ ] Keep read-only\n\n```javascript\nconst stable = true\n```'} />,
    )
    const task = await waitFor(() => {
      const item = container.querySelector<HTMLElement>('li[data-item-type="task"]')
      expect(item).toBeInTheDocument()
      return item
    })
    const language = getByRole('button', { name: 'Code block language: JavaScript' })

    rerender(<MilkdownEditor initialMarkdown={'- [ ] Keep read-only\n\n```javascript\nconst stable = true\n```'} presentationMode="read" />)

    await waitFor(() => expect(language).toBeDisabled())
    fireEvent.click(task!, { clientX: 0 })
    expect(task).toHaveAttribute('data-checked', 'false')
    expect(getByRole('button', { name: 'Copy' })).not.toBeDisabled()
  })

  it('uses localized editor labels and empty-state copy', async () => {
    const { container, getByText } = render(
      <MilkdownEditor
        ariaLabel="未命名 Markdown 文档"
        initialMarkdown=""
        placeholder="从一个想法开始…"
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toHaveAttribute('aria-label', '未命名 Markdown 文档')
    })
    expect(getByText('从一个想法开始…')).toBeVisible()
  })

  it('uses one contextual Block Handle and menu instead of the fixed toolbar', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown="Write here" contextualOverlayMount={overlayMount} />)

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible())
    expect(container.querySelector('.editor-toolbar')).not.toBeInTheDocument()
    expect(overlayMount.querySelectorAll('.block-handle')).toHaveLength(1)

    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() => expect(container.querySelector('h1')).toHaveTextContent('Write here'))
    overlayMount.remove()
  })

  it('retains Block Handle ownership when the pointer crosses from the editor into its portaled button', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown="Write here" contextualOverlayMount={overlayMount} />)
    const editorRoot = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.milkdown-editor')
      expect(element).toBeInTheDocument()
      return element!
    })
    const handle = await within(overlayMount).findByRole('button', { name: 'Add block' })

    fireEvent(editorRoot, new MouseEvent('pointerleave', { clientX: 166, clientY: 112, relatedTarget: handle }))
    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBe(handle))
    for (let move = 0; move < 20; move += 1) fireEvent.pointerMove(handle, { clientX: 166, clientY: 112 })
    expect(overlayMount.querySelectorAll('.block-handle')).toHaveLength(1)

    fireEvent.click(handle)
    const menu = await within(overlayMount).findByRole('menu', { name: 'Add block' })
    for (let move = 0; move < 20; move += 1) fireEvent.pointerMove(menu, { clientX: 180, clientY: 112 })
    expect(overlayMount.querySelector('.block-handle')).toBe(handle)
    expect(overlayMount.querySelector('.block-menu')).toBe(menu)
    overlayMount.remove()
  })

  it('applies Block Menu changes to the empty paragraph being typed in', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown="" contextualOverlayMount={overlayMount} />)

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 1' }))

    await waitFor(() => expect(container.querySelector('.ProseMirror > h1')).toBeInTheDocument())
    overlayMount.remove()
  })

  it('keeps Block Menu transformations in the existing editor history for Undo and Redo', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown="Write here" contextualOverlayMount={overlayMount} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })

    const menu = await openBlockMenu(overlayMount)
    fireEvent.click(menu.getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() => expect(editor.querySelector('h1')).toHaveTextContent('Write here'))

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(editor.querySelector('p')).toHaveTextContent('Write here'))

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(editor.querySelector('h1')).toHaveTextContent('Write here'))
    overlayMount.remove()
  })

  it.each([
    ['paragraph', '# Write here', 'Body text', (root: HTMLElement) => expect(root.querySelector('p')).toHaveTextContent('Write here')],
    ['heading 1', 'Write here', 'Heading 1', (root: HTMLElement) => expect(root.querySelector('h1')).toHaveTextContent('Write here')],
    ['heading 2', 'Write here', 'Heading 2', (root: HTMLElement) => expect(root.querySelector('h2')).toHaveTextContent('Write here')],
    ['heading 3', 'Write here', 'Heading 3', (root: HTMLElement) => expect(root.querySelector('h3')).toHaveTextContent('Write here')],
    ['quote', 'Write here', 'Quote', (root: HTMLElement) => expect(root.querySelector('blockquote')).toHaveTextContent('Write here')],
    ['bullet list', 'Write here', 'Bulleted list', (root: HTMLElement) => expect(root.querySelector('ul')).toHaveTextContent('Write here')],
    ['ordered list', 'Write here', 'Numbered list', (root: HTMLElement) => expect(root.querySelector('ol')).toHaveTextContent('Write here')],
    ['code block', 'Write here', 'Code block', (root: HTMLElement) => expect(root.querySelector('pre')).toHaveTextContent('Write here')],
    ['table', 'Write here', 'Table', (root: HTMLElement) => expect(root.querySelector('table')).toBeInTheDocument()],
    ['divider', 'Write here', 'Divider', (root: HTMLElement) => expect(root.querySelector('hr')).toBeInTheDocument()],
  ])('applies %s through the locked Block Menu target without HTML pollution', async (_name, markdown, label, assertion) => {
    const directory = mkdtempSync(join(tmpdir(), 'milo-block-menu-'))
    const file = join(directory, 'BLOCK_TEST.md')
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    writeFileSync(file, markdown, 'utf8')
    const onMarkdownChange = vi.fn((next: string) => writeFileSync(file, next, 'utf8'))
    const { container } = render(
      <MilkdownEditor initialMarkdown={markdown} contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />,
    )

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    onMarkdownChange.mockClear()
    const menu = await openBlockMenu(overlayMount)
    fireEvent.click(menu.getByRole(label === 'Table' || label === 'Divider' ? 'menuitem' : 'menuitemradio', { name: label }))

    await waitFor(() => assertion(editor))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    const saved = readFileSync(file, 'utf8')
    expect(saved).not.toContain('<br')
    expect(saved).not.toMatch(/^\\$/m)
    expect(saved).not.toMatch(/<[^>]+>/)
    const reopened = render(<MilkdownEditor initialMarkdown={saved} />)
    const reopenedEditor = await waitFor(() => {
      const element = reopened.container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    assertion(reopenedEditor)
    reopened.unmount()
    overlayMount.remove()
    rmSync(directory, { recursive: true, force: true })
  })

  it('keeps Block Menu open on its frozen block and cancels without document or disk changes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'milo-block-menu-cancel-'))
    const file = join(directory, 'BLOCK_TEST.md')
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const baseline = 'First block\n\nSecond block'
    writeFileSync(file, baseline, 'utf8')
    const onMarkdownChange = vi.fn((next: string) => writeFileSync(file, next, 'utf8'))
    const { container } = render(
      <MilkdownEditor editorId="block-test-tab" initialMarkdown={baseline} contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />,
    )
    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeInTheDocument())
    onMarkdownChange.mockClear()
    const menu = await openBlockMenu(overlayMount)
    const firstMenu = menu.getByRole('menu', { name: 'Add block' })
    const frozenTop = firstMenu.style.top
    fireEvent.pointerMove(container.querySelector('.milkdown-editor')!, { clientX: 0, clientY: 300 })
    expect(menu.getByRole('menu', { name: 'Add block' }).style.top).toBe(frozenTop)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(overlayMount.querySelector('.block-menu')).not.toBeInTheDocument())
    expect(onMarkdownChange).not.toHaveBeenCalled()
    expect(readFileSync(file, 'utf8')).toBe(baseline)

    const reopenedMenu = await openBlockMenu(overlayMount)
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(reopenedMenu.queryByRole('menu', { name: 'Add block' })).not.toBeInTheDocument())
    expect(onMarkdownChange).not.toHaveBeenCalled()
    expect(readFileSync(file, 'utf8')).toBe(baseline)
    overlayMount.remove()
    rmSync(directory, { recursive: true, force: true })
  })

  it('applies a Block Menu command to its frozen block rather than a later pointer target', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown={'First block\n\nSecond block'} contextualOverlayMount={overlayMount} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const menu = await openBlockMenu(overlayMount)

    // The menu already owns the first block. Pointer movement must not make
    // its command infer a new target from the DOM under the pointer.
    fireEvent.pointerMove(container.querySelector('.milkdown-editor')!, { clientX: 0, clientY: 400 })
    fireEvent.click(menu.getByRole('menuitemradio', { name: 'Heading 2' }))

    await waitFor(() => expect(editor.querySelector('h2')).toHaveTextContent('First block'))
    expect(editor.querySelectorAll('p')[0]).toHaveTextContent('Second block')
    overlayMount.remove()
  })

  it('inserts exactly one divider after a table without duplicating the table, and keeps one-step Undo/Redo', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const source = '| A | B |\n| :- | :- |\n| 1 | 2 |'
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown={source} contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const cell = editor.querySelector('td p')!
    const range = document.createRange()
    range.selectNodeContents(cell)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    const menu = await openBlockMenu(overlayMount)
    fireEvent.click(menu.getByRole('menuitem', { name: 'Divider' }))

    await waitFor(() => expect(editor.querySelectorAll('table')).toHaveLength(1))
    expect(editor.querySelectorAll('hr')).toHaveLength(1)
    const landingParagraph = editor.querySelector<HTMLElement>(':scope > p:last-child')
    const selection = window.getSelection()
    expect(landingParagraph).toBeInTheDocument()
    expect(document.activeElement).toBe(editor)
    expect(selection?.anchorNode === landingParagraph || landingParagraph?.contains(selection?.anchorNode ?? null)).toBe(true)
    expect(selection?.anchorOffset).toBe(0)
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith(expect.stringContaining('***')))
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved).not.toContain('<br')
    expect(saved).not.toMatch(/^\\$/m)
    expect(saved).not.toContain('\u200b')
    expect(saved).not.toContain('\u00a0')

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(editor.querySelectorAll('hr')).toHaveLength(0))
    expect(editor.querySelectorAll('table')).toHaveLength(1)
    expect(editor.querySelector(':scope > p:last-child')).not.toBeInTheDocument()
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(editor.querySelectorAll('hr')).toHaveLength(1))
    expect(editor.querySelectorAll('table')).toHaveLength(1)

    const restoredParagraph = editor.querySelector<HTMLElement>(':scope > p:last-child')!
    const restoredSelection = window.getSelection()
    expect(restoredSelection?.anchorNode === restoredParagraph || restoredParagraph.contains(restoredSelection?.anchorNode ?? null)).toBe(true)
    expect(restoredSelection?.anchorOffset).toBe(0)
    restoredParagraph.textContent = 'Divider 后正文'
    const typedRange = document.createRange()
    typedRange.selectNodeContents(restoredParagraph)
    typedRange.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(typedRange)
    fireEvent.input(editor, { data: 'Divider 后正文', inputType: 'insertText' })
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith(expect.stringContaining('Divider 后正文')))
    const savedWithBody = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(savedWithBody).not.toMatch(/<br\s*\/?>|^\\$/m)
    expect(savedWithBody).not.toContain('\u200b')
    expect(savedWithBody).not.toContain('\u00a0')
    const reopened = render(<MilkdownEditor initialMarkdown={savedWithBody} />)
    await waitFor(() => expect(reopened.container.querySelectorAll('table')).toHaveLength(1))
    expect(reopened.container.querySelectorAll('hr')).toHaveLength(1)
    expect(reopened.container.querySelector('.ProseMirror > p:last-child')).toHaveTextContent('Divider 后正文')
    reopened.unmount()
    overlayMount.remove()
  })

  it.each([
    ['table', '| A |\n| :- |\n| 1 |', 'td p', 'table'],
    ['code block', '```\ncode\n```', '.code-block-card__content', 'pre'],
  ])('deletes a %s through Block Menu in one undoable ProseMirror transaction', async (_name, source, selector, blockSelector) => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown={source} contextualOverlayMount={overlayMount} onMarkdownChange={onMarkdownChange} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const content = await waitFor(() => {
      const element = editor.querySelector<HTMLElement>(selector)
      expect(element).toBeInTheDocument()
      return element!
    })
    const range = document.createRange()
    range.selectNodeContents(content)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    const menu = await openBlockMenu(overlayMount)
    fireEvent.click(menu.getByRole('menuitem', { name: 'Delete block' }))
    await waitFor(() => expect(editor.querySelector(blockSelector)).not.toBeInTheDocument())
    expect(editor.querySelectorAll('p')).toHaveLength(1)
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).not.toMatch(/<br\s*\/?>|^\\$/m)
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(editor.querySelector(blockSelector)).toBeInTheDocument())
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(editor.querySelector(blockSelector)).not.toBeInTheDocument())
    overlayMount.remove()
  })

  it.each([['h1'], ['h2'], ['h3']])('keeps %s text and type when Enter is pressed at its start', async (tag) => {
    const { container } = render(<MilkdownEditor initialMarkdown={`${'#'.repeat(Number(tag.at(-1)))} Heading`} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const heading = editor.querySelector<HTMLElement>(tag)!
    const text = heading.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => {
      expect(editor.querySelector(`p + ${tag}`)).toHaveTextContent('Heading')
      expect(editor.querySelector('p')?.textContent).toBe('')
    })
  })

  it('splits a paragraph at offset zero into an independently formattable block', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        contextualOverlayMount={overlayMount}
        initialMarkdown={'第一段测试文字\n\n第二段测试文字'}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const firstParagraph = editor.querySelector<HTMLElement>(':scope > p:first-child')!
    expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
      ],
    })
    expect(editor.innerHTML).toBe('<p>第一段测试文字</p><p>第二段测试文字</p>')
    const range = document.createRange()
    range.setStart(firstParagraph.firstChild!, 0)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
      ],
    }))
    expect(editor.innerHTML).toBe('<p><br class="ProseMirror-trailingBreak"></p><p>第一段测试文字</p><p>第二段测试文字</p>')

    const titleParagraph = editor.querySelector<HTMLElement>(':scope > p:first-child')!
    titleParagraph.textContent = '标题'
    const titleRange = document.createRange()
    titleRange.selectNodeContents(titleParagraph)
    titleRange.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(titleRange)
    fireEvent.input(editor, { data: '标题', inputType: 'insertText' })

    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '标题' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
      ],
    }))
    expect(editor.innerHTML).toBe('<p>标题</p><p>第一段测试文字</p><p>第二段测试文字</p>')
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('标题\n\n第一段测试文字\n\n第二段测试文字\n'))

    const pmDoc = (editor as HTMLElement & { pmViewDesc?: { node?: {
      forEach: (callback: (node: { type: { name: string }; nodeSize: number }, offset: number) => void) => void
    } } }).pmViewDesc?.node
    expect(pmDoc).toBeDefined()
    const blocks: Array<{ position: number; type: string; nodeSize: number }> = []
    pmDoc?.forEach((node, position) => blocks.push({ position, type: node.type.name, nodeSize: node.nodeSize }))
    expect(blocks).toEqual([
      { position: 0, type: 'paragraph', nodeSize: 4 },
      { position: 4, type: 'paragraph', nodeSize: 9 },
      { position: 13, type: 'paragraph', nodeSize: 9 },
    ])
    const blockElements = Array.from(editor.children)
    const fakeView = {
      state: { doc: pmDoc },
      nodeDOM: (position: number) => blockElements[blocks.findIndex((block) => block.position === position)] ?? null,
      domAtPos: () => ({ node: editor }),
    } as unknown as Parameters<typeof blockTargetAtPosition>[0]
    expect(blocks.map((block) => blockTargetAtPosition(fakeView, 'standalone', block.position + 1)?.targetBlockPosition)).toEqual([0, 4, 13])

    fireEvent.click(await within(overlayMount).findByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { id: '标题', level: 1 }, content: [{ type: 'text', text: '标题' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
      ],
    }))

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(Array.from(editor.children).map((node) => node.tagName)).toEqual(['P', 'P']))
    expect(editor.children[0]).toHaveTextContent('第一段测试文字')
    expect(editor.children[1]).toHaveTextContent('第二段测试文字')
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(Array.from(editor.children).map((node) => node.tagName)).toEqual(['H1', 'P', 'P']))
    expect(editor.children[0]).toHaveTextContent('标题')
    expect(editor.children[1]).toHaveTextContent('第一段测试文字')
    expect(editor.children[2]).toHaveTextContent('第二段测试文字')

    const firstBodyParagraph = editor.querySelector<HTMLElement>(':scope > p')!
    const bodyRange = document.createRange()
    bodyRange.setStart(firstBodyParagraph.firstChild!, 0)
    bodyRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(bodyRange)
    fireEvent.mouseUp(editor)
    fireEvent.click(await within(overlayMount).findByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 2' }))
    await waitFor(() => expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { id: '标题', level: 1 }, content: [{ type: 'text', text: '标题' }] },
        { type: 'heading', attrs: { id: '第一段测试文字', level: 2 }, content: [{ type: 'text', text: '第一段测试文字' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
      ],
    }))
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('# 标题\n\n## 第一段测试文字\n\n第二段测试文字\n'))
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved).not.toMatch(/<br\s*\/?>|^\\$/m)
    expect(saved).not.toContain('\u200b')
    expect(saved).not.toContain('\u00a0')

    const reopened = render(<MilkdownEditor initialMarkdown={saved} />)
    const reopenedEditor = await waitFor(() => {
      const element = reopened.container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    expect(Array.from(reopenedEditor.children).map((node) => node.tagName)).toEqual(['H1', 'H2', 'P'])
    expect(reopenedEditor.children[0]).toHaveTextContent('标题')
    expect(reopenedEditor.children[1]).toHaveTextContent('第一段测试文字')
    expect(reopenedEditor.children[2]).toHaveTextContent('第二段测试文字')
    reopened.unmount()
    overlayMount.remove()
  })

  it('closes a tab’s Block Menu and discards its target when that tab becomes inactive', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const view = render(
      <>
        <MilkdownEditor active editorId="tab-a" initialMarkdown="Tab A" contextualOverlayMount={overlayMount} />
        <MilkdownEditor active={false} editorId="tab-b" initialMarkdown="Tab B" contextualOverlayMount={overlayMount} />
      </>,
    )
    const firstHandle = await within(overlayMount).findByRole('button', { name: 'Add block' })
    fireEvent.click(firstHandle)
    await within(overlayMount).findByRole('menu', { name: 'Add block' })

    fireEvent.click(within(overlayMount).getByRole('menuitem', { name: 'More Headings' }))
    expect(within(overlayMount).getByRole('menu', { name: 'More Headings' })).toBeInTheDocument()

    view.rerender(
      <>
        <MilkdownEditor active={false} editorId="tab-a" initialMarkdown="Tab A" contextualOverlayMount={overlayMount} />
        <MilkdownEditor active editorId="tab-b" initialMarkdown="Tab B" contextualOverlayMount={overlayMount} />
      </>,
    )

    await waitFor(() => expect(overlayMount.querySelector('.block-menu')).not.toBeInTheDocument())
    const secondHandle = await within(overlayMount).findByRole('button', { name: 'Add block' })
    expect(secondHandle).not.toBe(firstHandle)
    fireEvent.click(secondHandle)
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 3' }))
    await waitFor(() => expect(view.container.querySelectorAll('.ProseMirror')[1].querySelector('h3')).toHaveTextContent('Tab B'))
    expect(view.container.querySelectorAll('.ProseMirror')[0].querySelector('p')).toHaveTextContent('Tab A')
    view.rerender(
      <>
        <MilkdownEditor active editorId="tab-a" initialMarkdown="Tab A" contextualOverlayMount={overlayMount} />
        <MilkdownEditor active={false} editorId="tab-b" initialMarkdown="Tab B" contextualOverlayMount={overlayMount} />
      </>,
    )
    await waitFor(() => expect(within(overlayMount).queryByRole('menu')).not.toBeInTheDocument())
    overlayMount.remove()
  })

  it('keeps Block Handle and Selection Toolbar mutually exclusive across edit, read, and inactive states', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container, rerender } = render(
      <MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible())
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() => expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible())
    expect(within(overlayMount).queryByRole('button', { name: 'Add block' })).not.toBeInTheDocument()

    rerender(<MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} presentationMode="read" />)
    await waitFor(() => expect(within(overlayMount).queryByRole('button', { name: 'Add block' })).not.toBeInTheDocument())
    rerender(<MilkdownEditor active={false} initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />)
    expect(within(overlayMount).queryByRole('button', { name: 'Add block' })).not.toBeInTheDocument()
    overlayMount.remove()
  })

  it('inserts a body paragraph before an empty heading when Enter is pressed at its start', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown="" contextualOverlayMount={overlayMount} />)

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })
    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() => expect(container.querySelector('.ProseMirror > h1')).toBeInTheDocument())

    fireEvent.keyDown(editor!, { key: 'Enter' })

    await waitFor(() => {
      const paragraph = container.querySelector('.ProseMirror > p + h1')?.previousElementSibling
      const selection = window.getSelection()

      expect(paragraph).toBeInTheDocument()
      expect(container.querySelector('.ProseMirror > h1')).toBeInTheDocument()
      expect(selection?.anchorNode === paragraph || paragraph?.contains(selection?.anchorNode ?? null)).toBe(true)
      expect(selection?.anchorOffset).toBe(0)
    })
    overlayMount.remove()
  })

  it.each([
    ['H1', '#'],
    ['H2', '##'],
    ['H3', '###'],
  ])('creates exactly one paragraph before %s at heading-start Enter', async (_name, marker) => {
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown={`${marker} 你好`} onMarkdownChange={onMarkdownChange} />)

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })
    const heading = editor!.querySelector(`h${marker.length}`)
    const range = document.createRange()
    range.setStart(heading!.firstChild!, 0)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.keyDown(editor!, { key: 'Enter' })

    await waitFor(() => {
      const paragraph = editor!.querySelector<HTMLElement>(`:scope > p:first-child`)
      expect(editor!.querySelector(`h${marker.length}`)).toHaveTextContent('你好')
      expect(paragraph).toBeInTheDocument()
      expect(document.activeElement).toBe(editor)
      expect(window.getSelection()?.anchorNode === paragraph || paragraph?.contains(window.getSelection()?.anchorNode ?? null)).toBe(true)
      expect(window.getSelection()?.anchorOffset).toBe(0)
    })

    const paragraph = editor!.querySelector<HTMLElement>(':scope > p:first-child')!
    paragraph.textContent = '你啊红'
    const typedRange = document.createRange()
    typedRange.selectNodeContents(paragraph)
    typedRange.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(typedRange)
    fireEvent.input(editor!, { data: '你啊红', inputType: 'insertText' })

    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith(`你啊红\n\n${marker} 你好\n`))
    expect(proseMirrorDocJSON(editor!)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '你啊红' }] },
        { type: 'heading', attrs: { id: '你好', level: marker.length }, content: [{ type: 'text', text: '你好' }] },
      ],
    })
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved).not.toMatch(/<br\s*\/?>|^\\$/m)
    expect(saved).not.toContain('\u200b')
    expect(saved).not.toContain('\u00a0')
    const reopened = render(<MilkdownEditor initialMarkdown={saved} />)
    const reopenedEditor = await waitFor(() => {
      const element = reopened.container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    expect(Array.from(reopenedEditor.children).map((node) => node.tagName)).toEqual(['P', `H${marker.length}`])
    expect(reopenedEditor.querySelector(':scope > p')).toHaveTextContent('你啊红')
    expect(reopenedEditor.querySelector(`:scope > h${marker.length}`)).toHaveTextContent('你好')
    reopened.unmount()

    fireEvent.keyDown(editor!, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(editor!.querySelector(':scope > p:first-child')).not.toBeInTheDocument())
    expect(editor!.querySelector(`h${marker.length}`)).toHaveTextContent('你好')
    fireEvent.keyDown(editor!, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(editor!.querySelector(':scope > p:first-child')).toHaveTextContent('你啊红'))
  })

  it.each([
    ['code block', '```text\nconst ready = true\n```', '.code-block-card__content', 'pre'],
    ['table', '| A | B |\n| :- | :- |\n| 1 | 2 |', 'td p', 'table'],
  ])('keeps a visible, focused caret when Cmd+Enter exits a %s', async (_name, source, contentSelector, blockSelector) => {
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown={source} onMarkdownChange={onMarkdownChange} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const content = await waitFor(() => {
      const element = editor.querySelector<HTMLElement>(contentSelector)
      expect(element).toBeInTheDocument()
      return element!
    })
    const range = document.createRange()
    range.selectNodeContents(content)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true })

    const paragraph = await waitFor(() => {
      const element = editor.querySelector<HTMLElement>(':scope > p:last-child')
      const selection = window.getSelection()
      expect(element).toBeInTheDocument()
      expect(document.activeElement).toBe(editor)
      expect(selection?.isCollapsed).toBe(true)
      expect(selection?.anchorNode === element || element?.contains(selection?.anchorNode ?? null)).toBe(true)
      expect(selection?.anchorOffset).toBe(0)
      return element!
    })

    paragraph.textContent = '继续写'
    const text = paragraph.firstChild!
    const typedRange = document.createRange()
    typedRange.setStart(text, text.textContent?.length ?? 0)
    typedRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(typedRange)
    fireEvent.input(editor, { data: '继续写', inputType: 'insertText' })

    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved).toContain('继续写')
    expect(saved).not.toMatch(/<br\s*\/?>/i)
    expect(saved).not.toMatch(/^\\$/m)
    expect(saved).not.toContain('\u200b')
    expect(saved).not.toContain('\u00a0')
    expect(editor.querySelector(blockSelector)).toBeInTheDocument()

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(editor.querySelector(':scope > p:last-child')).not.toBeInTheDocument())
    expect(editor.querySelector(blockSelector)).toBeInTheDocument()
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(editor.querySelector(':scope > p:last-child')).toHaveTextContent('继续写'))
  })

  it('formats the block under the visible cursor instead of the previous heading', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<MilkdownEditor initialMarkdown={'# 标题\n\n正文'} contextualOverlayMount={overlayMount} />)

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })
    const paragraph = container.querySelector<HTMLElement>('.ProseMirror > p')
    expect(paragraph).toHaveTextContent('正文')

    const range = document.createRange()
    range.selectNodeContents(paragraph!)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    await waitFor(() => expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible())
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 2' }))

    await waitFor(() => {
      expect(editor!.querySelector('h1')).toHaveTextContent('标题')
      expect(editor!.querySelector('h2')).toHaveTextContent('正文')
    })
    overlayMount.remove()
  })

  it('builds a clickable document outline from headings', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown={'# First chapter\n\n## A detail\n\nBody'} outlineMount={outlineMount} />,
    )
    const queries = within(outlineMount)

    await waitFor(() => {
      expect(queries.getByRole('navigation', { name: 'Outline' })).toBeInTheDocument()
      expect(queries.getByRole('button', { name: 'First chapter' })).toBeVisible()
      expect(queries.getByRole('button', { name: 'A detail' })).toBeVisible()
    })

    fireEvent.click(queries.getByRole('button', { name: 'A detail' }))
    // Outline navigation deliberately scrolls without moving the editing
    // selection or focusing the editor.  This avoids WebKit scrolling again
    // just to reveal a caret, and therefore keeps navigation read-only too.
    expect(container.querySelector('.ProseMirror')).toBeInTheDocument()
    outlineMount.remove()
  })

  it('navigates through the document-stage DOM scroll root in both edit and read modes', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container, rerender } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={'# First\n\n## Second'} onMarkdownChange={onMarkdownChange} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: 'Second' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    let scrollTop = 0
    Object.defineProperty(stage, 'scrollTop', { configurable: true, get: () => scrollTop, set: (next: number) => { scrollTop = next } })
    fireEvent.click(within(outlineMount).getByRole('button', { name: 'Second' }))
    expect(stage.scrollTop).toBe(0)

    onMarkdownChange.mockClear()
    rerender(<section className="document-stage"><MilkdownEditor initialMarkdown={'# First\n\n## Second'} onMarkdownChange={onMarkdownChange} outlineMount={outlineMount} presentationMode="read" /></section>)
    fireEvent.click(within(outlineMount).getByRole('button', { name: 'Second' }))
    expect(stage.scrollTop).toBe(0)
    expect(onMarkdownChange).not.toHaveBeenCalled()
    outlineMount.remove()
  })

  it('uses one outline component for an inline rail and the compact drawer', async () => {
    const onCloseOutline = vi.fn()
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const { rerender } = render(
      <section className="document-stage"><MilkdownEditor initialMarkdown={'# First\n\n## Second'} outlineLayout="drawer" outlineMount={outlineMount} outlineOpen onCloseOutline={onCloseOutline} /></section>,
    )

    await waitFor(() => expect(within(outlineMount).getByRole('navigation', { name: 'Outline' })).toHaveAttribute('id', 'outline-drawer'))
    fireEvent.mouseDown(outlineMount.querySelector('.outline-backdrop')!)
    expect(onCloseOutline).toHaveBeenCalledOnce()

    onCloseOutline.mockClear()
    fireEvent.click(within(outlineMount).getByRole('button', { name: 'Second' }))
    expect(onCloseOutline).toHaveBeenCalledOnce()

    rerender(<section className="document-stage"><MilkdownEditor initialMarkdown={'# First\n\n## Second'} outlineLayout="inline" outlineMount={outlineMount} /></section>)
    await waitFor(() => expect(within(outlineMount).getByRole('navigation', { name: 'Outline' })).not.toHaveAttribute('id'))
    outlineMount.remove()
  })

  it('navigates inline and drawer headings through their stable ProseMirror position', async () => {
    const inlineMount = document.body.appendChild(document.createElement('aside'))
    const drawerMount = document.body.appendChild(document.createElement('aside'))
    const inlineScrollTo = vi.fn()
    const drawerScrollTo = vi.fn()
    const closeDrawer = vi.fn()
    const inline = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={inlineMount} /></section>)

    await waitFor(() => expect(within(inlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const inlineStage = inline.container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(inlineStage, inline.container, inlineScrollTo)
    fireEvent.click(within(inlineMount).getByRole('button', { name: '20. Chapter 20' }))
    expect(inlineStage.scrollTop).toBe(1700)

    const drawer = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineLayout="drawer" outlineMount={drawerMount} outlineOpen onCloseOutline={closeDrawer} /></section>)
    await waitFor(() => expect(within(drawerMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const drawerStage = drawer.container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(drawerStage, drawer.container, drawerScrollTo)
    fireEvent.click(within(drawerMount).getByRole('button', { name: '20. Chapter 20' }))
    expect(drawerStage.scrollTop).toBe(1700)
    expect(closeDrawer).toHaveBeenCalledOnce()

    inlineMount.remove()
    drawerMount.remove()
  })

  it('uses the last visible heading as active at the document bottom', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo, 1700)
    fireEvent.scroll(stage)

    await waitFor(() => {
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location')
      expect(within(outlineMount).getByRole('button', { name: '18. Chapter 18' })).not.toHaveAttribute('aria-current')
    })
    outlineMount.remove()
  })

  it('keeps a clicked heading active until its resulting scroll position is observed', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    let scrollTop = 0
    Object.defineProperties(stage, {
      clientHeight: { configurable: true, get: () => 500 },
      scrollHeight: { configurable: true, get: () => 2200 },
      scrollTop: { configurable: true, get: () => scrollTop, set: (next: number) => { scrollTop = next } },
    })
    Object.defineProperty(stage, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 100, 800, 500) })
    Array.from(container.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')).forEach((heading, index) => {
      Object.defineProperty(heading, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 220 + index * 100, 600, 32) })
    })
    Object.defineProperty(stage, 'scrollTo', { configurable: true, value: vi.fn() })

    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '18. Chapter 18' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('keeps the clicked heading active when WebKit lands just below the activation line', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '10. Chapter 10' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    // A fractional landing position replicates the WebKit boundary case: the
    // heading is 0.5px under its intended anchor, while the preceding heading
    // is already above it.
    setStageGeometry(stage, container, scrollTo, 0, -0.5)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '10. Chapter 10' }))
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '10. Chapter 10' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '9. Chapter 9' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('keeps a clicked final heading active through programmatic bottom-scroll frames', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo, 0)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    fireEvent.scroll(stage)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '18. Chapter 18' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('clears a hidden tab\'s navigation lock before it becomes active again', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const initialMarkdown = longOutlineMarkdown()
    const { container, rerender } = render(
      <section className="document-stage"><MilkdownEditor active initialMarkdown={initialMarkdown} outlineMount={outlineMount} /></section>,
    )

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '13. Chapter 13' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, vi.fn())
    fireEvent.click(within(outlineMount).getByRole('button', { name: '13. Chapter 13' }))
    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '13. Chapter 13' })).toHaveAttribute('aria-current', 'location'))

    rerender(
      <section className="document-stage"><MilkdownEditor active={false} initialMarkdown={initialMarkdown} outlineMount={outlineMount} /></section>,
    )
    stage.scrollTop = 1700
    rerender(
      <section className="document-stage"><MilkdownEditor active initialMarkdown={initialMarkdown} outlineMount={outlineMount} /></section>,
    )
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '13. Chapter 13' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('keeps a clicked penultimate heading active when bottom clamping also exposes the final heading', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '19. Chapter 19' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '19. Chapter 19' }))
    fireEvent.scroll(stage)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '19. Chapter 19' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).not.toHaveAttribute('aria-current')

    // A real pointer interaction is the hand-off to ordinary scroll-derived
    // highlighting; at the bottom that correctly resolves to chapter 20.
    fireEvent.pointerDown(stage)
    fireEvent.scroll(stage)
    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location'))
    outlineMount.remove()
  })

  it('returns to scroll-derived active state after the clicked navigation has painted', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    // Mimic a scrollbar drag after the click. It does not emit a wheel event,
    // so the active item must not be held by a stale pending navigation.
    fireEvent.pointerDown(stage)
    stage.scrollTop = 0
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '1. Chapter 1' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('does not let an inactive editor navigate its hidden tab outline', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor active={false} initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo)
    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    expect(scrollTo).not.toHaveBeenCalled()
    outlineMount.remove()
  })

  it('resolves navigation from the editor that becomes active after a tab switch', async () => {
    const firstOutlineMount = document.body.appendChild(document.createElement('aside'))
    const secondOutlineMount = document.body.appendChild(document.createElement('aside'))
    const first = render(
      <section className="document-stage">
        <MilkdownEditor active initialMarkdown={longOutlineMarkdown()} outlineMount={firstOutlineMount} />
      </section>,
    )
    const second = render(
      <section className="document-stage">
        <MilkdownEditor active={false} initialMarkdown={longOutlineMarkdown().replaceAll('Chapter', 'Other chapter')} outlineMount={secondOutlineMount} />
      </section>,
    )

    await waitFor(() => expect(within(firstOutlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    await waitFor(() => expect(within(secondOutlineMount).getByRole('button', { name: '20. Other chapter 20' })).toBeVisible())
    const firstStage = first.container.querySelector<HTMLElement>('.document-stage')!
    const secondStage = second.container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(firstStage, first.container, vi.fn())
    setStageGeometry(secondStage, second.container, vi.fn())

    // The inactive document's stale heading model cannot move either stage.
    fireEvent.click(within(secondOutlineMount).getByRole('button', { name: '20. Other chapter 20' }))
    expect(secondStage.scrollTop).toBe(0)

    second.rerender(
      <section className="document-stage">
        <MilkdownEditor active initialMarkdown={longOutlineMarkdown().replaceAll('Chapter', 'Other chapter')} outlineMount={secondOutlineMount} />
      </section>,
    )
    fireEvent.click(within(secondOutlineMount).getByRole('button', { name: '20. Other chapter 20' }))

    expect(secondStage.scrollTop).toBe(1700)
    expect(firstStage.scrollTop).toBe(0)
    firstOutlineMount.remove()
    secondOutlineMount.remove()
  })

  it('replaces the WebView menu with localized editing commands', async () => {
    const copy = {
      bold: '粗体',
      copy: '复制',
      cut: '剪切',
      italic: '斜体',
      paste: '粘贴',
      selectAll: '全选',
    }
    const { container, getByRole, queryByRole } = render(<MilkdownEditor copy={copy} initialMarkdown="右键编辑" />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })

    fireEvent.contextMenu(editor!, { clientX: 120, clientY: 160 })

    expect(getByRole('menu')).toBeVisible()
    expect(getByRole('menuitem', { name: /复制/ })).toBeInTheDocument()
    expect(getByRole('menuitem', { name: /粘贴/ })).toBeInTheDocument()
    expect(queryByRole('menuitem', { name: /^Copy/ })).not.toBeInTheDocument()
  })

  it('renders GFM task lists and tables in the editing surface', async () => {
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'- [ ] Shape the draft\n\n| Area | State |\n| --- | --- |\n| Editor | Ready |'}
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
    expect(table.querySelector('tbody > tr[data-is-header="true"] > th > p')).toHaveTextContent('Area')
    expect(table.querySelector('tbody > tr:not([data-is-header]) > td > p')).toHaveTextContent('Editor')
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
      expect(first.container.querySelector('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
      expect(first.container.querySelector('.ProseMirror > .tableWrapper')).toBe(firstWrapper)
      expect(firstWrapper.querySelector(':scope > table')).toBe(firstTable)
    })
    expect(second.container.querySelector('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
    expect(second.container.querySelector('.ProseMirror > .tableWrapper')).toBe(secondWrapper)
    first.unmount()
    second.unmount()
  })

  it('anchors a table BlockTarget to its stable TableView wrapper without changing its semantic target', async () => {
    const { container } = render(
      <MilkdownEditor initialMarkdown={'First\n\n| A | B |\n| --- | --- |\n| one | two |\n\nThird'} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const wrapper = editor.querySelector<HTMLElement>(':scope > .tableWrapper')!
    const table = wrapper.querySelector<HTMLTableElement>(':scope > table')!
    const cellParagraph = table.querySelector<HTMLElement>('td > p')!
    const pmDoc = (editor as HTMLElement & { pmViewDesc?: { node?: {
      descendants: (callback: (node: { type: { name: string } }, position: number, parent: { type: { name: string } } | null) => boolean | void) => void
      nodeAt: (position: number) => { type: { name: string } } | null
      resolve: (position: number) => unknown
      content: { size: number }
      textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string
    } } }).pmViewDesc?.node
    expect(pmDoc).toBeDefined()

    let tablePosition = -1
    let cellParagraphPosition = -1
    pmDoc?.descendants((node, position, parent) => {
      if (node.type.name === 'table') tablePosition = position
      if (cellParagraphPosition < 0 && node.type.name === 'paragraph' && parent?.type.name === 'table_cell') {
        cellParagraphPosition = position
      }
    })
    expect(tablePosition).toBeGreaterThanOrEqual(0)
    expect(cellParagraphPosition).toBeGreaterThan(tablePosition)

    let scrollLeft = 0
    Object.defineProperty(wrapper, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (next: number) => { scrollLeft = next },
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

    expect([leftTarget.rect.left, middleTarget.rect.left, rightTarget.rect.left]).toEqual([100, 100, 100])
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
      nodeDOM: (position: number) => position === tablePosition ? table : position === cellParagraphPosition ? cellParagraph : null,
    } as unknown as Parameters<typeof blockTargetAtPosition>[0]
    wrapper.scrollLeft = 0
    expect(blockTargetAtPosition(legacyView, 'legacy-table', cellParagraphPosition + 1)?.rect.left).toBe(100)
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

  it('keeps remote images unloaded until the author explicitly requests one', async () => {
    const { container, getByRole } = render(
      <MilkdownEditor initialMarkdown="![A remote illustration](https://images.example.test/quiet.png)" />,
    )

    const button = await waitFor(() => getByRole('button', { name: 'Load remote image: A remote illustration' }))
    expect(container.querySelector('img[src^="https://"]')).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Loading image…')
  })

  it('keeps a broken local image node and Markdown intact when loading fails', async () => {
    const markdown = '![Broken alt](missing.png "Broken title")\n\nAfter\n'
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor documentPath="/documents/note.md" initialMarkdown={markdown} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const image = await waitFor(() => {
      const element = container.querySelector<HTMLImageElement>('.local-image-view img')
      expect(element).toBeInTheDocument()
      return element!
    })
    const before = proseMirrorDocJSON(editor)
    const updateCount = onMarkdownChange.mock.calls.length

    fireEvent.error(image)

    await waitFor(() => expect(container.querySelector('.local-image-placeholder[data-image-state="error"]')).toHaveTextContent('Broken alt'))
    expect(container.querySelector('.local-image-placeholder[data-image-state="error"]')).toHaveTextContent('Could not load image')
    expect(proseMirrorDocJSON(editor)).toEqual(before)
    const documentJson = proseMirrorDocJSON(editor) as { content: unknown[] }
    expect(documentJson.content[0]).toMatchObject({
      content: [{ type: 'image', attrs: { src: 'missing.png', alt: 'Broken alt', title: 'Broken title' } }],
    })
    expect(onMarkdownChange).toHaveBeenCalledTimes(updateCount)

    const paragraph = editor.querySelector<HTMLElement>(':scope > p:last-child')!
    paragraph.textContent = 'After!'
    fireEvent.input(paragraph, { data: '!', inputType: 'insertText' })
    await waitFor(() => expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toContain('![Broken alt](missing.png "Broken title")'))
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).not.toContain('<br />')
  })

  it('renders an empty image source as inert chrome without changing its node or Markdown', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(<MilkdownEditor initialMarkdown={'![]()\n\nAfter\n'} onMarkdownChange={onMarkdownChange} />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const placeholder = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.local-image-placeholder[data-image-state="empty"]')
      expect(element).toBeInTheDocument()
      return element!
    })
    const before = proseMirrorDocJSON(editor)
    const updateCount = onMarkdownChange.mock.calls.length

    expect(placeholder).toHaveAttribute('contenteditable', 'false')
    expect(placeholder).toHaveTextContent('Could not load image')
    expect(container.querySelector('.local-image-view img')).not.toBeInTheDocument()
    expect((before as { content: unknown[] }).content[0]).toMatchObject({
      content: [{ type: 'image', attrs: { src: '', alt: '', title: null } }],
    })
    await Promise.resolve()
    expect(proseMirrorDocJSON(editor)).toEqual(before)
    expect(onMarkdownChange).toHaveBeenCalledTimes(updateCount)

    const paragraph = editor.querySelector<HTMLElement>(':scope > p:last-child')!
    paragraph.textContent = 'After!'
    fireEvent.input(paragraph, { data: '!', inputType: 'insertText' })
    await waitFor(() => expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toContain('![]()'))
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).not.toContain('<br />')
  })

  it('updates local image states on one stable root and ignores stale image events', () => {
    const { imageNode, view } = localImageNodeViewTestHarness('a.png', 'Diagram', 'Title')
    const root = view.dom as HTMLElement
    const imageA = root.querySelector('img')!

    expect(view.update?.(imageNode('b.png'), [], {} as never)).toBe(true)
    const imageB = root.querySelector('img')!
    expect(imageB).not.toBe(imageA)
    expect(root.dataset.imageState).toBe('loading')

    fireEvent.error(imageA)
    fireEvent.load(imageA)
    expect(root.querySelector('img')).toBe(imageB)
    expect(root.dataset.imageState).toBe('loading')

    fireEvent.load(imageB)
    expect(root.dataset.imageState).toBe('loaded')
    expect(view.update?.(imageNode('missing.png'), [], {} as never)).toBe(true)
    const missing = root.querySelector('img')!
    fireEvent.error(missing)
    expect(root.dataset.imageState).toBe('error')
    expect(root.querySelector('.local-image-placeholder')).toHaveTextContent('Diagram')

    expect(view.update?.(imageNode('valid.png'), [], {} as never)).toBe(true)
    const valid = root.querySelector('img')!
    fireEvent.load(valid)
    expect(view.dom).toBe(root)
    expect(root.dataset.imageState).toBe('loaded')
    expect(root.querySelector('.local-image-placeholder')).not.toBeInTheDocument()
    view.destroy?.()
  })

  it('ignores only mutations inside the local image NodeView chrome', () => {
    const { view } = localImageNodeViewTestHarness('missing.png', 'Diagram')
    const root = view.dom as HTMLElement
    const image = root.querySelector('img')!
    const outside = document.createElement('p')
    document.body.append(outside)

    expect(view.ignoreMutation?.({ type: 'attributes', target: image } as unknown as MutationRecord)).toBe(true)
    expect(view.ignoreMutation?.({ type: 'childList', target: root } as unknown as MutationRecord)).toBe(true)
    expect(view.ignoreMutation?.({ type: 'attributes', target: outside } as unknown as MutationRecord)).toBe(false)
    view.destroy?.()
  })

  it('applies Prism syntax decorations to a code block language', async () => {
    const { container } = render(
      <MilkdownEditor initialMarkdown={'```javascript\nconst greeting = "hello"\n```'} />,
    )

    await waitFor(() => expect(container.querySelector('.token.keyword')).toHaveTextContent('const'))
    expect(container.querySelector('.token.string')).toHaveTextContent('"hello"')
  })

  it('keeps code-block authored content on the stable pre content DOM boundary', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown={'```\n你好啊\n```'} />)

    const content = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.code-block-card__content')
      expect(element).toHaveTextContent('你好啊')
      return element!
    })

    expect(content.tagName).toBe('PRE')
    expect(content.querySelector('code')).not.toBeInTheDocument()
  })

  it('edits code-block languages from the embedded header without changing its code', async () => {
    const onMarkdownChange = vi.fn()
    const source = 'const greeting = "hello"'
    const { container, getByRole } = render(
      <MilkdownEditor initialMarkdown={`\`\`\`\n${source}\n\`\`\``} onMarkdownChange={onMarkdownChange} />,
    )

    const language = await waitFor(() => getByRole('button', { name: 'Code block language: Plain text' }))
    expect(container.querySelector('.code-block-card__content')).toHaveTextContent(source)
    expect(container.querySelector('.code-block-card__language-menu')).toHaveAttribute('hidden')

    fireEvent.click(language)
    fireEvent.click(getByRole('option', { name: 'JavaScript' }))

    await waitFor(() => {
      expect(getByRole('button', { name: 'Code block language: JavaScript' })).toBeVisible()
      expect(onMarkdownChange).toHaveBeenLastCalledWith(`\`\`\`javascript\n${source}\n\`\`\`\n`)
    })
  })

  it('does not send a Markdown document path to the local image protocol', async () => {
    const { container } = render(
      <MilkdownEditor initialMarkdown="![Unexpected document](/Users/example/notes.md)" />,
    )

    await waitFor(() => expect(container.querySelector('.invalid-local-image')).toHaveTextContent('Unexpected document'))
    expect(container.querySelector('img:not(.ProseMirror-separator)')).not.toBeInTheDocument()
  })
})

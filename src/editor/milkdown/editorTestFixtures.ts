import { fireEvent, within } from '@testing-library/react'

import { type vi } from 'vitest'
import { Schema } from '@milkdown/prose/model'
import { EditorState } from '@milkdown/prose/state'
import { tableEditing, tableNodes } from '@milkdown/prose/tables'
import { EditorView } from '@milkdown/prose/view'

import { createImageNodeView } from './imageNodeView'

export function longOutlineMarkdown() {
  return Array.from(
    { length: 20 },
    (_, index) => `## ${index + 1}. Chapter ${index + 1}\n\nContent for chapter ${index + 1}.`,
  ).join('\n\n')
}

export function proseMirrorDocJSON(editor: HTMLElement) {
  return (
    editor as HTMLElement & { pmViewDesc?: { node?: { toJSON: () => unknown } } }
  ).pmViewDesc?.node?.toJSON()
}

export function localImageNodeViewTestHarness(source: string, alt = '', title: string | null = '') {
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
  const imageNode = (src: string, nextAlt = alt, nextTitle: string | null = title) =>
    schema.nodes.image.create({ src, alt: nextAlt, title: nextTitle })
  const constructor = createImageNodeView(
    { current: '/documents/note.md' },
    {
      current: {
        loadImage: 'Load image',
        loadImageError: 'Could not load image — try again',
        loadingImage: 'Loading image…',
        loadRemoteImage: (imageAlt: string) => `Load remote image: ${imageAlt}`,
      },
    },
  )
  const view = constructor(imageNode(source), {} as EditorView, () => 1, [], {} as never)
  document.body.append(view.dom)
  return { imageNode, view }
}

export function imageSelectionTestView(source = 'image.png') {
  const schema = new Schema({
    nodes: {
      doc: { content: 'paragraph+' },
      paragraph: { content: 'inline*', toDOM: () => ['p', 0] },
      image: {
        inline: true,
        group: 'inline',
        atom: true,
        selectable: true,
        attrs: { src: { default: '' }, alt: { default: '' }, title: { default: null } },
        toDOM: (node) => ['img', node.attrs],
      },
      text: { group: 'inline' },
    },
  })
  const image = schema.nodes.image.create({ src: source, alt: 'Diagram', title: 'Runtime title' })
  const doc = schema.nodes.doc.create(
    null,
    schema.nodes.paragraph.create(null, [image, schema.text('After')]),
  )
  const mount = document.body.appendChild(document.createElement('div'))
  const transactions: number[] = []
  const constructor = createImageNodeView(
    { current: '/documents/note.md' },
    {
      current: {
        loadImageError: 'Could not load image — try again',
        loadImage: 'Load image',
        loadingImage: 'Loading image…',
        loadRemoteImage: (alt: string) => `Load remote image: ${alt}`,
      },
    },
  )
  const view = new EditorView(mount, {
    state: EditorState.create({ doc }),
    nodeViews: { image: constructor },
    dispatchTransaction: (transaction) => {
      transactions.push(transaction.steps.length)
      view.updateState(view.state.apply(transaction))
    },
  })
  return { mount, transactions, view }
}

export function cellSelectionTestView() {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
      text: { group: 'inline' },
      ...tableNodes({ tableGroup: 'block', cellContent: 'paragraph+', cellAttributes: {} }),
    },
  })
  const paragraph = (text: string) =>
    schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
  const cell = (text: string, header = false) =>
    schema.nodes[header ? 'table_header' : 'table_cell'].create(null, paragraph(text))
  const rows = [
    ['你好世界', 'B', 'C'],
    ['D', 'E', 'F'],
    ['G', 'H', 'I'],
  ].map((values, row) =>
    schema.nodes.table_row.create(
      null,
      values.map((value) => cell(value, row === 0)),
    ),
  )
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
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell')
      cellPositions.push(position)
  })
  return { cellPositions, mount, view }
}

export function setDOMTextSelection(node: Text, from: number, to: number) {
  const range = document.createRange()
  range.setStart(node, from)
  range.setEnd(node, to)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
}

export function headingSelectionTestView() {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      heading: {
        attrs: { level: { default: 1 } },
        content: 'text*',
        group: 'block',
        toDOM: () => ['h1', 0],
      },
      paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
      text: { group: 'inline' },
    },
  })
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.heading.create(null, schema.text('Heading target')),
    schema.nodes.paragraph.create(null, schema.text('Paragraph target text')),
  ])
  const mount = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(mount, {
    state: EditorState.create({ doc }),
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction))
    },
  })
  return { mount, view }
}

export async function openBlockMenu(overlayMount: HTMLElement) {
  const handle = await within(overlayMount).findByRole('button', { name: 'Add block' })
  fireEvent.click(handle)
  return within(overlayMount)
}

export function setStageGeometry(
  stage: HTMLElement,
  container: HTMLElement,
  scrollTo: ReturnType<typeof vi.fn>,
  initialScrollTop = 0,
  landingOffset = 0,
) {
  let scrollTop = initialScrollTop
  const documentYByHeading = new Map(
    Array.from(
      container.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3'),
    ).map((heading, index) => [heading, 120 + index * 100]),
  )

  Object.defineProperties(stage, {
    clientHeight: { configurable: true, get: () => 500 },
    scrollHeight: { configurable: true, get: () => 2200 },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (next: number) => {
        scrollTop = next
      },
    },
  })
  Object.defineProperty(stage, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 100, 800, 500),
  })
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

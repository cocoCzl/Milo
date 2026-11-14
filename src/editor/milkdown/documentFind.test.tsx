import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@milkdown/prose/state'
import { Schema } from '@milkdown/prose/model'
import { createDocumentFind, findKey, findMatches, setFindQuery } from './documentFind'
import { MilkdownEditor } from './MilkdownEditor'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', group: 'block' },
    text: { group: 'inline' },
  },
  marks: { strong: {} },
})
afterEach(cleanup)

describe('document find', () => {
  it('matches across marks, respects model positions and caches text per immutable document', () => {
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('中文 Hel'),
      schema.text('lo', [schema.marks.strong.create()]),
      schema.text(' '),
      schema.text('hello', [schema.marks.strong.create()]),
    ])
    const doc = schema.nodes.doc.create(null, paragraph)
    expect(findMatches(doc, 'HELLO')).toEqual([
      { from: 4, to: 9 },
      { from: 10, to: 15 },
    ])
    expect(findMatches(doc, '中文')).toEqual([{ from: 1, to: 3 }])
    expect(findMatches(doc, '')).toEqual([])
  })

  it('does not change content, selection or transaction history metadata', () => {
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text('hello'))),
      plugins: [createDocumentFind(() => undefined)],
    })
    const transaction = state.tr.setMeta(findKey, { query: 'hello' }).setMeta('addToHistory', false)
    const next = state.apply(transaction)
    expect(transaction.docChanged).toBe(false)
    expect(transaction.getMeta('addToHistory')).toBe(false)
    expect(next.doc).toBe(state.doc)
    expect(next.selection.eq(state.selection)).toBe(true)
    expect(findKey.getState(next)?.query).toBe('hello')
    expect(typeof setFindQuery).toBe('function')
  })

  it('finds Chinese, English and code in both modes and ignores composing Enter', async () => {
    const change = vi.fn()
    const initialMarkdown = '中文 **Hello** hello\n\n```js\nhello 中文\n```\n'
    const { container, getByRole, rerender } = render(
      <MilkdownEditor initialMarkdown={initialMarkdown} onMarkdownChange={change} />,
    )
    await waitFor(() =>
      expect(container.querySelector('.milkdown-editor')).toHaveAttribute('aria-busy', 'false'),
    )
    const editor = container.querySelector<HTMLElement>('.ProseMirror')!
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 'f', metaKey: true })
      expect(getByRole('textbox', { name: 'Find in document' })).toBeInTheDocument()
    })
    const input = getByRole('textbox', { name: 'Find in document' })
    fireEvent.change(input, { target: { value: 'hello' } })
    await waitFor(() => expect(container.querySelectorAll('.document-find-match')).toHaveLength(3))
    expect(getByRole('status')).toHaveTextContent('1 / 3')
    const current = container.querySelector('.document-find-match--current')!.textContent
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(getByRole('status')).toHaveTextContent('1 / 3')
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(getByRole('status')).toHaveTextContent('2 / 3')
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(getByRole('status')).toHaveTextContent('1 / 3')
    expect(current?.toLowerCase()).toBe('hello')
    rerender(
      <MilkdownEditor
        initialMarkdown={initialMarkdown}
        onMarkdownChange={change}
        presentationMode="read"
      />,
    )
    fireEvent.change(input, { target: { value: '中文' } })
    await waitFor(() => expect(container.querySelectorAll('.document-find-match')).toHaveLength(2))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(container.querySelector('.document-find')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.document-find-match')).toHaveLength(0)
    expect(container.querySelector('.ProseMirror')).toBe(editor)
    expect(change).not.toHaveBeenCalled()
    expect(editor).toHaveFocus()
  })

  it('clears query and decorations when leaving a tab and preserves its editor', async () => {
    const { container, rerender, getByRole } = render(
      <MilkdownEditor initialMarkdown="正文 正文" />,
    )
    await waitFor(() =>
      expect(container.querySelector('.milkdown-editor')).toHaveAttribute('aria-busy', 'false'),
    )
    const editor = container.querySelector('.ProseMirror')
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 'f', metaKey: true })
      expect(getByRole('textbox', { name: 'Find in document' })).toBeInTheDocument()
    })
    fireEvent.change(getByRole('textbox', { name: 'Find in document' }), {
      target: { value: '正文' },
    })
    await waitFor(() => expect(container.querySelectorAll('.document-find-match')).toHaveLength(2))
    rerender(<MilkdownEditor initialMarkdown="正文 正文" active={false} />)
    expect(container.querySelector('.document-find')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.document-find-match')).toHaveLength(0)
    rerender(<MilkdownEditor initialMarkdown="正文 正文" active />)
    expect(container.querySelector('.ProseMirror')).toBe(editor)
  })
})

it('replaces across inline marks in one undo step, never across paragraphs, and respects read-only', async () => {
  const { EditorView } = await import('@milkdown/prose/view')
  const { history, undo, redo } = await import('@milkdown/prose/history')
  const { replaceFindMatches } = await import('./documentFind')
  const paragraph = schema.nodes.paragraph.create(null, [
    schema.text('Hel'),
    schema.text('lo', [schema.marks.strong.create()]),
    schema.text(' '),
    schema.text('hello', [schema.marks.strong.create()]),
  ])
  const doc = schema.nodes.doc.create(null, [
    paragraph,
    schema.nodes.paragraph.create(null, schema.text('hello')),
  ])
  const host = document.body.appendChild(document.createElement('div'))
  // Minimal schema serialization for a real ProseMirror view.
  const liveSchema = new Schema({
    nodes: {
      doc: { content: 'paragraph+' },
      paragraph: { content: 'text*', toDOM: () => ['p', 0] },
      text: {},
    },
    marks: { strong: { toDOM: () => ['strong', 0] } },
  })
  const view = new EditorView(host, {
    state: EditorState.create({
      schema: liveSchema,
      doc: liveSchema.nodeFromJSON(doc.toJSON()),
      plugins: [history(), createDocumentFind(() => undefined)],
    }),
  })
  try {
    setFindQuery(view, 'hello')
    expect(replaceFindMatches(view, '中文', true)).toBe(true)
    expect(view.state.doc.textContent).toBe('中文 中文中文')
    expect(view.dom.querySelector('strong')?.textContent).toBe('中文')
    expect(undo(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.textContent).toBe('Hello hellohello')
    expect(redo(view.state, view.dispatch)).toBe(true)
    setFindQuery(view, '中文中文')
    expect(replaceFindMatches(view, 'bad', true)).toBe(false)
    view.setProps({ editable: () => false })
    setFindQuery(view, '中文')
    expect(replaceFindMatches(view, 'bad', true)).toBe(false)
    expect(view.state.doc.textContent).toBe('中文 中文中文')
  } finally {
    view.destroy()
    host.remove()
  }
})

it('bounds decorations for many literal matches while retaining match navigation', () => {
  const doc = schema.nodes.doc.create(
    null,
    schema.nodes.paragraph.create(null, schema.text('a '.repeat(3000))),
  )
  const matches = findMatches(doc, 'a')
  const state = EditorState.create({ schema, doc, plugins: [createDocumentFind(() => undefined)] })
  const next = state.apply(state.tr.setMeta(findKey, { query: 'a', matches, current: 1500 }))
  expect(findKey.getState(next)?.matches).toHaveLength(3000)
  expect(findKey.getState(next)?.decorations.find()).toHaveLength(500)
  expect(findMatches(doc, 'A', true)).toHaveLength(0)
})

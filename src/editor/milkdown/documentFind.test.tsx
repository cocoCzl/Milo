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
      schema.text(' hello'),
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
    fireEvent.keyDown(window, { key: 'f', metaKey: true })
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
    fireEvent.keyDown(window, { key: 'f', metaKey: true })
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

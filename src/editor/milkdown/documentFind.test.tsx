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
    expect([...findMatches(doc, 'HELLO')]).toEqual([
      { from: 4, to: 9 },
      { from: 10, to: 15 },
    ])
    expect([...findMatches(doc, '中文')]).toEqual([{ from: 1, to: 3 }])
    expect([...findMatches(doc, '')]).toEqual([])
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
    expect(await replaceFindMatches(view, '中文', true)).toBe(true)
    expect(view.state.doc.textContent).toBe('中文 中文中文')
    expect(view.dom.querySelector('strong')?.textContent).toBe('中文')
    expect(undo(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.textContent).toBe('Hello hellohello')
    expect(redo(view.state, view.dispatch)).toBe(true)
    setFindQuery(view, '中文中文')
    expect(await replaceFindMatches(view, 'bad', true)).toBe(false)
    view.setProps({ editable: () => false })
    setFindQuery(view, '中文')
    expect(await replaceFindMatches(view, 'bad', true)).toBe(false)
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

it('uses Unicode simple folding with original UTF-16 offsets, without normalization or expansions', () => {
  const text = '😀 ÉCOLE école İ i ß ss Σ ς σ K k ſ s 𐐀 𐐨 e\u0301 é'
  const doc = schema.node('doc', null, schema.node('paragraph', null, schema.text(text)))
  const matched = (query: string, matchCase = false) =>
    [...findMatches(doc, query, matchCase)].map(({ from, to }) => doc.textBetween(from, to))
  expect(matched('école')).toEqual(['ÉCOLE', 'école'])
  expect(matched('ÉCOLE', true)).toEqual(['ÉCOLE'])
  expect(matched('i')).toEqual(['i'])
  expect(matched('ss')).toEqual(['ss'])
  expect(matched('σ')).toEqual(['Σ', 'ς', 'σ'])
  expect(matched('k')).toEqual(['K', 'k'])
  expect(matched('s')).toEqual(['s', 's', 'ſ', 's'])
  expect(matched('𐐨')).toEqual(['𐐀', '𐐨'])
  expect(matched('é')).toEqual(['É', 'é', 'é'])
  expect(matched('e\u0301')).toEqual(['e\u0301'])
})

it('keeps literal, non-overlapping matches across scan windows and formatting, never across atoms', () => {
  const inlineSchema = new Schema({
    nodes: {
      doc: { content: 'paragraph+' },
      paragraph: { content: 'inline*' },
      text: { group: 'inline' },
      atom: { inline: true, group: 'inline', atom: true },
    },
    marks: { strong: {} },
  })
  const prefix = 'x'.repeat(32767)
  const doc = inlineSchema.node(
    'doc',
    null,
    inlineSchema.node('paragraph', null, [
      inlineSchema.text(prefix + 'É'),
      inlineSchema.text('COLE', [inlineSchema.marks.strong.create()]),
      inlineSchema.nodes.atom.create(),
      inlineSchema.text('école aaa .* []'),
    ]),
  )
  expect([...findMatches(doc, 'école')]).toEqual([
    { from: 32768, to: 32773 },
    { from: 32774, to: 32779 },
  ])
  expect(findMatches(doc, 'écoleécole')).toHaveLength(0)
  expect(findMatches(doc, 'aa')).toHaveLength(1)
  expect(findMatches(doc, '.*')).toHaveLength(1)
  expect(findMatches(doc, '[]')).toHaveLength(1)
})

async function liveFind(text: string) {
  const { EditorView } = await import('@milkdown/prose/view')
  const { history } = await import('@milkdown/prose/history')
  const liveSchema = new Schema({
    nodes: {
      doc: { content: 'paragraph+' },
      paragraph: { content: 'text*', toDOM: () => ['p', 0] },
      text: {},
    },
  })
  const host = document.body.appendChild(document.createElement('div'))
  const notify = vi.fn()
  const view = new EditorView(host, {
    state: EditorState.create({
      schema: liveSchema,
      doc: liveSchema.node('doc', null, liveSchema.node('paragraph', null, liveSchema.text(text))),
      plugins: [history(), createDocumentFind(notify)],
    }),
  })
  return {
    view,
    notify,
    close: () => {
      view.destroy()
      host.remove()
    },
  }
}

it.each(['query', 'document', 'close', 'destroy'] as const)(
  'drops sliced search work after %s changes',
  async (action) => {
    const { view, notify, close } = await liveFind('alpha beta alpha')
    vi.useFakeTimers()
    let clock = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5))
    try {
      setFindQuery(view, 'alpha')
      await vi.advanceTimersByTimeAsync(100)
      expect(findKey.getState(view.state)?.busy).toBe(true)
      expect(findKey.getState(view.state)?.matches).toHaveLength(0)
      if (action === 'query') setFindQuery(view, 'beta')
      if (action === 'document')
        view.dispatch(view.state.tr.insertText(' alpha', view.state.doc.content.size - 1))
      if (action === 'close') setFindQuery(view, '')
      if (action === 'destroy') {
        view.destroy()
        notify.mockClear()
      }
      await vi.runAllTimersAsync()
      if (action === 'destroy') expect(notify).not.toHaveBeenCalled()
      else {
        const result = findKey.getState(view.state)!
        expect(result.matches).toHaveLength(action === 'query' ? 1 : action === 'document' ? 3 : 0)
        expect(result.busy).toBe(false)
        expect(result.query).toBe(action === 'query' ? 'beta' : action === 'close' ? '' : 'alpha')
      }
    } finally {
      now.mockRestore()
      vi.useRealTimers()
      close()
    }
  },
)

it.each(['document', 'query', 'close', 'composition', 'newer'] as const)(
  'does not apply stale replacement positions after %s changes',
  async (action) => {
    const { view, close } = await liveFind('alpha alpha')
    const { replaceFindMatches } = await import('./documentFind')
    vi.useFakeTimers()
    let clock = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5))
    try {
      setFindQuery(view, 'alpha')
      await vi.runAllTimersAsync()
      const pending = replaceFindMatches(view, 'WRONG', true)
      if (action === 'document') view.dispatch(view.state.tr.insertText(' changed', 12))
      if (action === 'query') setFindQuery(view, 'missing')
      if (action === 'close') setFindQuery(view, '')
      if (action === 'composition')
        Object.defineProperty(view, 'composing', { value: true, configurable: true })
      const newer = action === 'newer' ? replaceFindMatches(view, 'correct', true) : null
      await vi.runAllTimersAsync()
      expect(await pending).toBe(false)
      if (newer) {
        expect(await newer).toBe(true)
        expect(view.state.doc.textContent).toBe('correct correct')
      } else
        expect(view.state.doc.textContent).toBe(
          action === 'document' ? 'alpha alpha changed' : 'alpha alpha',
        )
    } finally {
      now.mockRestore()
      vi.useRealTimers()
      close()
    }
  },
)

it('replaces every high-frequency match, preserves mapped selection and has exactly one undo action', async () => {
  const { view, close } = await liveFind('alpha '.repeat(12000))
  const { replaceFindMatches, moveFindMatch } = await import('./documentFind')
  const { TextSelection } = await import('@milkdown/prose/state')
  const { undo, redo, undoDepth } = await import('@milkdown/prose/history')
  try {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))
    const selection = view.state.selection
    const original = view.state.doc
    setFindQuery(view, 'alpha')
    await waitFor(() => expect(findKey.getState(view.state)?.busy).toBe(false))
    expect(findKey.getState(view.state)?.matches).toHaveLength(12000)
    moveFindMatch(view, -1)
    expect(findKey.getState(view.state)?.current).toBe(11999)
    expect(view.state.selection.eq(selection)).toBe(true)
    expect(await replaceFindMatches(view, 'école', true)).toBe(true)
    expect(view.state.doc.textContent).toBe('école '.repeat(12000))
    expect(undoDepth(view.state)).toBe(1)
    expect(undo(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.eq(original)).toBe(true)
    expect(view.state.selection.eq(selection)).toBe(true)
    expect(undoDepth(view.state)).toBe(0)
    expect(redo(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.textContent).toBe('école '.repeat(12000))
  } finally {
    close()
  }
})

it.each(['', 'Z', '🦉$&'])(
  'bulk preparation agrees with individual replacements across nested blocks and marks: %s',
  async (replacement) => {
    const { prepareFindReplacement } = await import('./documentFindReplace')
    const { runFindTask } = await import('./documentFindMatches')
    const nested = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { content: 'inline*', group: 'block' },
        quote: { content: 'block+', group: 'block' },
        table: { content: 'row+', group: 'block' },
        row: { content: 'cell+' },
        cell: { content: 'paragraph+' },
        code: { content: 'text*', group: 'block', code: true },
        atom: { group: 'inline', inline: true, atom: true },
        text: { group: 'inline' },
      },
      marks: { strong: {}, em: {} },
    })
    const text = (t: string, mark?: string) =>
      nested.text(t, mark ? [nested.marks[mark].create()] : [])
    const p = (...children: Parameters<typeof nested.node>[2][]) =>
      nested.node('paragraph', null, children.flat() as never)
    const unchanged = p(text('unchanged'))
    const doc = nested.node('doc', null, [
      p(
        text('é'),
        text('cole', 'strong'),
        text(' ÉCOLE'),
        nested.nodes.atom.create(),
        text('école', 'em'),
      ),
      nested.node('quote', null, [p(text('école', 'strong')), unchanged]),
      nested.node(
        'table',
        null,
        nested.node('row', null, [
          nested.node('cell', null, p(text('ÉCOLE'))),
          nested.node('cell', null, p(text('école'))),
        ]),
      ),
      nested.node('code', null, text('école ÉCOLE')),
    ])
    const matches = findMatches(doc, 'école')
    const reference = EditorState.create({ doc }).tr
    for (const { from, to } of [...matches].reverse())
      reference.replaceWith(
        from,
        to,
        replacement ? nested.text(replacement, doc.nodeAt(from)!.marks) : [],
      )
    const prepared = await runFindTask(
      prepareFindReplacement(doc, matches, replacement),
      new AbortController().signal,
    )
    expect(prepared.doc.eq(reference.doc)).toBe(true)
    expect(prepared.doc.child(1).child(1)).toBe(unchanged)
    expect(doc.textContent).toContain('école')
  },
)

it('cancels a pending replacement on an undo intent even when there is no undo step yet', async () => {
  const { view, close } = await liveFind('école ÉCOLE')
  const { replaceFindMatches } = await import('./documentFind')
  vi.useFakeTimers()
  let clock = 0
  const now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5))
  try {
    setFindQuery(view, 'école')
    await vi.runAllTimersAsync()
    const pending = replaceFindMatches(view, '学校', true)
    // No history transaction can be generated yet: preparation has not committed.
    view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        code: 'KeyZ',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    await vi.runAllTimersAsync()
    expect(await pending).toBe(false)
    expect(view.state.doc.textContent).toBe('école ÉCOLE')
  } finally {
    now.mockRestore()
    vi.useRealTimers()
    close()
  }
})

it.each(['query', 'replacement'])(
  'cancels preparation from a %s field history intent without hijacking field undo',
  async (fieldName) => {
    const { view, close } = await liveFind('ÉCOLE école')
    const { replaceFindMatches } = await import('./documentFind')
    const chrome = view.dom.parentElement!
    chrome.className = 'milkdown-editor'
    const field = chrome.appendChild(document.createElement('input'))
    field.setAttribute('aria-label', fieldName)
    field.value = 'field value'
    vi.useFakeTimers()
    let clock = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5))
    try {
      setFindQuery(view, 'école')
      await vi.runAllTimersAsync()
      const pending = replaceFindMatches(view, '学校', true)
      field.focus()
      const event = new InputEvent('beforeinput', {
        inputType: 'historyUndo',
        bubbles: true,
        cancelable: true,
      })
      field.dispatchEvent(event)
      await vi.runAllTimersAsync()
      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(field)
      expect(field.value).toBe('field value')
      expect(await pending).toBe(false)
      expect(view.state.doc.textContent).toBe('ÉCOLE école')
    } finally {
      now.mockRestore()
      vi.useRealTimers()
      close()
    }
  },
)

import { describe, expect, it, vi } from 'vitest'
import { Schema } from '@milkdown/prose/model'
import { EditorState, TextSelection, type Command } from '@milkdown/prose/state'
import { wrapInHeadingCommand } from '@milkdown/preset-commonmark'
import { createEditorCommands, isValidEditorSelectionSnapshot, splitTopLevelParagraphAtStart } from './editorCommands'
import type { BlockTarget } from './blockControls'

function runner() {
  return {
    runMilkdown: vi.fn(() => true),
    runProse: vi.fn(() => true),
    readState: vi.fn(() => null),
  }
}

function dividerState(blocks: string[]) {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { content: 'text*', group: 'block' },
      hr: { group: 'block', atom: true },
      text: {},
    },
  })
  const doc = schema.node('doc', undefined, blocks.map((text) => schema.node('paragraph', undefined, text ? [schema.text(text)] : [])))
  return EditorState.create({ doc, selection: TextSelection.create(doc, 1) })
}

function applyDivider(state: EditorState, insertAfterPosition: number) {
  const host = runner()
  const commands = createEditorCommands(host)
  const target = {
    insertAfterPosition,
    selection: { doc: state.doc, from: 1, to: 1, text: '' },
  } as BlockTarget
  commands.insertDivider(target)
  const command = (host.runProse.mock.calls as unknown as Array<[Command]>)[0]![0]
  expect(command(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
  return state
}

describe('editorCommands', () => {
  it.each([4, 5, 6] as const)('delegates H%i with the unchanged frozen selection', (level) => {
    const host = runner()
    const state = dividerState(['First', 'Second'])
    const selection = { doc: state.doc, from: 1, to: 1, text: '' }
    const commands = createEditorCommands(host)
    commands[`setHeading${level}`](selection)
    expect(host.runMilkdown).toHaveBeenCalledExactlyOnceWith(wrapInHeadingCommand.key, level, selection)
    expect(host.runProse).not.toHaveBeenCalled()
  })

  it('inserts one sibling paragraph at a top-level paragraph start in one transaction', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*', group: 'block' },
        text: {},
      },
    })
    const doc = schema.node('doc', undefined, [
      schema.node('paragraph', undefined, [schema.text('A')]),
      schema.node('paragraph', undefined, [schema.text('B')]),
    ])
    const before = EditorState.create({ doc, selection: TextSelection.create(doc, 1) })
    let transactionJSON: unknown
    let after = before

    expect(splitTopLevelParagraphAtStart(before, (transaction) => {
      transactionJSON = {
        steps: transaction.steps.map((step) => step.toJSON()),
        selectionBefore: { from: before.selection.from, to: before.selection.to },
        selectionAfter: { from: transaction.selection.from, to: transaction.selection.to },
      }
      after = before.apply(transaction)
    })).toBe(true)

    expect(transactionJSON).toEqual({
      steps: [{ stepType: 'replace', from: 0, to: 0, slice: { content: [{ type: 'paragraph' }] } }],
      selectionBefore: { from: 1, to: 1 },
      selectionAfter: { from: 1, to: 1 },
    })
    expect(after.doc.toJSON()).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    })

    const inputTransaction = after.tr.insertText('标题')
    expect({
      steps: inputTransaction.steps.map((step) => step.toJSON()),
      selectionBefore: { from: after.selection.from, to: after.selection.to },
      selectionAfter: { from: inputTransaction.selection.from, to: inputTransaction.selection.to },
    }).toEqual({
      steps: [{ stepType: 'replace', from: 1, to: 1, slice: { content: [{ type: 'text', text: '标题' }] } }],
      selectionBefore: { from: 1, to: 1 },
      selectionAfter: { from: 3, to: 3 },
    })
    after = after.apply(inputTransaction)
    expect(after.doc.toJSON()).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '标题' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    })
  })

  it('leaves non-start, ranged, and nested paragraph Enter behavior to the standard keymap', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { content: 'text*', group: 'block' },
        blockquote: { content: 'block+', group: 'block' },
        text: {},
      },
    })
    const topLevelDoc = schema.node('doc', undefined, [
      schema.node('paragraph', undefined, [schema.text('AB')]),
    ])
    const nestedDoc = schema.node('doc', undefined, [
      schema.node('blockquote', undefined, [
        schema.node('paragraph', undefined, [schema.text('AB')]),
      ]),
    ])
    const dispatch = vi.fn()

    expect(splitTopLevelParagraphAtStart(
      EditorState.create({ doc: topLevelDoc, selection: TextSelection.create(topLevelDoc, 2) }),
      dispatch,
    )).toBe(false)
    expect(splitTopLevelParagraphAtStart(
      EditorState.create({ doc: topLevelDoc, selection: TextSelection.create(topLevelDoc, 1, 2) }),
      dispatch,
    )).toBe(false)
    expect(splitTopLevelParagraphAtStart(
      EditorState.create({ doc: nestedDoc, selection: TextSelection.create(nestedDoc, 2) }),
      dispatch,
    )).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('routes inline formatting and link mutations through one command runner', () => {
    const host = runner()
    const commands = createEditorCommands(host)
    const selection = { doc: {} as never, from: 2, to: 8, text: 'sample' }

    commands.toggleBold(selection)
    commands.toggleItalic(selection)
    commands.toggleStrike(selection)
    commands.toggleInlineCode(selection)
    commands.applyLinkToSelection('https://milo.example', selection)
    commands.removeLink(selection)

    expect(host.runMilkdown).toHaveBeenCalledTimes(4)
    const calls = host.runMilkdown.mock.calls as unknown as Array<[unknown, unknown, unknown]>
    expect(calls.every(([, , snapshot]) => snapshot === selection)).toBe(true)
    expect(host.runProse).toHaveBeenCalledTimes(2)
    expect(host.runProse).toHaveBeenCalledWith(expect.any(Function), selection)
  })

  it('writes and removes a real ProseMirror link mark for the selected text', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'inline*', group: 'block' },
        text: { group: 'inline' },
      },
      marks: {
        link: { attrs: { href: {} }, inclusive: false },
      },
    })
    const doc = schema.node('doc', undefined, [schema.node('paragraph', undefined, [schema.text('hello')])])
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 6) })
    const beforeText = state.doc.textContent
    const beforeBlocks = state.doc.content.content.map((node) => ({ type: node.type.name, childCount: node.childCount }))
    const host = runner()
    const commands = createEditorCommands(host)
    const proseCalls = host.runProse.mock.calls as unknown as Array<[Command]>

    commands.applyLinkToSelection('https://example.com')
    const apply = proseCalls[0]![0]
    expect(apply(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(state.doc.rangeHasMark(1, 6, schema.marks.link)).toBe(true)
    expect(schema.marks.link.isInSet(state.doc.nodeAt(1)!.marks)?.attrs.href).toBe('https://example.com')
    expect(state.doc.textContent).toBe(beforeText)
    expect(state.doc.content.content.map((node) => ({ type: node.type.name, childCount: node.childCount }))).toEqual(beforeBlocks)
    let hasHardBreak = false
    state.doc.descendants((node) => { if (node.type.name === 'hard_break') hasHardBreak = true })
    expect(hasHardBreak).toBe(false)

    commands.removeLink()
    const remove = proseCalls[1]![0]
    expect(remove(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(state.doc.rangeHasMark(1, 6, schema.marks.link)).toBe(false)
    expect(state.doc.textContent).toBe('hello')
  })

  it('inserts a marked link at a cursor, but never treats an unsafe URL as a link', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'inline*', group: 'block' },
        text: { group: 'inline' },
      },
      marks: { link: { attrs: { href: {} }, inclusive: false } },
    })
    const doc = schema.node('doc', undefined, [schema.node('paragraph', undefined, [schema.text('before')])])
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 7) })
    const host = runner()
    const commands = createEditorCommands(host)
    const proseCalls = host.runProse.mock.calls as unknown as Array<[Command]>

    commands.insertLink('百度', 'https://www.baidu.com/')
    expect(proseCalls[0]![0](state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(state.doc.textContent).toBe('before百度')
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.rangeHasMark(7, 9, schema.marks.link)).toBe(true)

    commands.insertLink('unsafe', 'javascript:alert(1)')
    expect(proseCalls[1]![0](state, () => undefined)).toBe(false)
  })

  it('rejects a selection snapshot after the underlying document has changed', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'inline*', group: 'block' },
        text: { group: 'inline' },
      },
    })
    const doc = schema.node('doc', undefined, [schema.node('paragraph', undefined, [schema.text('hello')])])
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 6) })
    const snapshot = { doc: state.doc, from: 1, to: 6, text: 'hello' }
    const changed = state.apply(state.tr.insertText('!', 6))

    expect(isValidEditorSelectionSnapshot(state, snapshot)).toBe(true)
    expect(isValidEditorSelectionSnapshot(state, { ...snapshot, text: 'wrong range' })).toBe(false)
    expect(isValidEditorSelectionSnapshot(changed, snapshot)).toBe(false)
  })

  it('routes all block actions through the same adapter without Markdown string edits', () => {
    const host = runner()
    const commands = createEditorCommands(host)

    commands.setParagraph()
    commands.setHeading1()
    commands.setHeading2()
    commands.setHeading3()
    commands.setQuote()
    commands.setCodeBlock()
    commands.toggleBulletList()
    commands.toggleOrderedList()
    commands.insertDivider()
    commands.insertTable()

    expect(host.runMilkdown).toHaveBeenCalledTimes(9)
    const calls = host.runMilkdown.mock.calls as unknown as Array<[unknown, unknown, unknown]>
    expect(calls[8][1]).toEqual({ row: 3, col: 3 })
    expect(host.runProse).toHaveBeenCalledWith(expect.any(Function), undefined)
  })

  it('inserts a divider and one editable paragraph at the document end', () => {
    const state = applyDivider(dividerState(['A']), 3)

    expect(state.doc.toJSON()).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'hr' },
        { type: 'paragraph' },
      ],
    })
    expect(state.selection).toBeInstanceOf(TextSelection)
    expect(state.selection.from).toBe(5)
    expect(state.selection.$from.parent.type.name).toBe('paragraph')
  })

  it('reuses the following paragraph after a divider instead of creating another one', () => {
    const state = applyDivider(dividerState(['A', 'B']), 3)

    expect(state.doc.toJSON()).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'hr' },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    })
    expect(state.selection.from).toBe(5)
    expect(state.selection.$from.parent.textContent).toBe('B')
  })
})

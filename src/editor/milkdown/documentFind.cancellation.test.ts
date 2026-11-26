import { afterEach, describe, expect, it, vi } from 'vitest'
import { history, redoDepth, undoDepth } from '@milkdown/prose/history'
import { Schema } from '@milkdown/prose/model'
import { EditorState } from '@milkdown/prose/state'
import { EditorView } from '@milkdown/prose/view'
import { createDocumentFind, findKey, replaceFindMatches, setFindQuery } from './documentFind'
import * as tasks from './documentFindMatches'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('replacement preparation history intent (controlled task, not native input)', () => {
  it.each([
    ['editor', 'undo', 'keydown'],
    ['editor', 'redo', 'keydown'],
    ['query', 'undo', 'keydown'],
    ['query', 'redo', 'keydown'],
    ['replacement', 'undo', 'keydown'],
    ['replacement', 'redo', 'keydown'],
    ['query', 'undo', 'beforeinput'],
    ['query', 'redo', 'beforeinput'],
    ['replacement', 'undo', 'beforeinput'],
    ['replacement', 'redo', 'beforeinput'],
  ] as const)(
    '%s %s via %s cancels empty-history preparation and rejects its late result',
    async (target, intent, type) => {
      vi.useFakeTimers()
      const schema = new Schema({
        nodes: {
          doc: { content: 'paragraph+' },
          paragraph: { content: 'text*', toDOM: () => ['p', 0] },
          text: {},
        },
      })
      const original = schema.node(
        'doc',
        null,
        schema.node('paragraph', null, schema.text('😀 ÉCOLE école')),
      )
      const host = document.body.appendChild(document.createElement('div'))
      host.className = 'milkdown-editor'
      const view = new EditorView(host, {
        state: EditorState.create({
          schema,
          doc: original,
          plugins: [history(), createDocumentFind(() => undefined)],
        }),
      })
      const field = host.appendChild(document.createElement('input'))
      field.setAttribute('aria-label', target)
      field.value = 'independent field history'
      const entered = deferred<AbortSignal>()
      const release = deferred<void>()
      let calculationFinished = false
      try {
        setFindQuery(view, 'école')
        await vi.runAllTimersAsync()
        expect(findKey.getState(view.state)?.resultDoc).toBe(original)
        expect(findKey.getState(view.state)?.matches.length).toBe(2)

        // Hold the real replacement generator after entering preparation.
        // Deliberately finish it even after abort, to exercise the final
        // immutable-snapshot/cancellation check rather than runner rejection.
        vi.spyOn(tasks, 'runFindTask').mockImplementationOnce(
          async <T>(task: Generator<void, T>, signal: AbortSignal): Promise<T> => {
            entered.resolve(signal)
            await release.promise
            let next = task.next()
            while (!next.done) next = task.next()
            calculationFinished = true
            return next.value
          },
        )
        const pending = replaceFindMatches(view, '学校', true)
        const signal = await entered.promise
        expect(findKey.getState(view.state)?.replacing).toBe(true)
        expect(signal.aborted).toBe(false)
        expect(calculationFinished).toBe(false)
        expect(undoDepth(view.state)).toBe(0)
        expect(redoDepth(view.state)).toBe(0)
        const selection = view.state.selection
        const destination = target === 'editor' ? view.dom : field
        destination.focus()

        // jsdom has no native input undo stack. Verify that the field's own
        // handler/default action remains reachable and uncancelled; native
        // input-field history is a separate acceptance boundary.
        const fieldHandler = vi.fn((event: Event) => {
          expect(event.defaultPrevented).toBe(false)
          expect(signal.aborted).toBe(true)
        })
        field.addEventListener(type, fieldHandler)
        const event =
          type === 'keydown'
            ? new KeyboardEvent(type, {
                key: 'z',
                code: 'KeyZ',
                metaKey: true,
                shiftKey: intent === 'redo',
                bubbles: true,
                cancelable: true,
              })
            : new InputEvent(type, {
                inputType: intent === 'undo' ? 'historyUndo' : 'historyRedo',
                bubbles: true,
                cancelable: true,
              })
        expect(destination.dispatchEvent(event)).toBe(true)
        expect(event.defaultPrevented).toBe(false)
        expect(signal.aborted).toBe(true)
        expect(document.activeElement).toBe(destination)
        expect(field.value).toBe('independent field history')
        expect(fieldHandler).toHaveBeenCalledTimes(target === 'editor' ? 0 : 1)
        expect(view.state.doc).toBe(original)

        release.resolve()
        expect(await pending).toBe(false)
        expect(calculationFinished).toBe(true)
        await vi.runAllTimersAsync()
        expect(view.state.doc).toBe(original)
        expect(view.state.doc.textContent).toBe('😀 ÉCOLE école')
        expect(view.state.selection.eq(selection)).toBe(true)
        expect(findKey.getState(view.state)?.replacing).toBe(false)
        expect(undoDepth(view.state)).toBe(0)
        expect(redoDepth(view.state)).toBe(0)
      } finally {
        release.resolve()
        view.destroy()
        host.remove()
      }
    },
  )
})

// Architecture probe, not an enabled view-eviction implementation.
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorStateCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { history } from '@milkdown/plugin-history'
import { undo, redo, undoDepth } from '@milkdown/prose/history'
import { EditorView } from '@milkdown/prose/view'
import { expect, it } from 'vitest'

it('preserves ProseMirror history across view recreation but needs explicit Milkdown view ownership', async () => {
  const root = document.body.appendChild(document.createElement('div'))
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, 'Original')
    })
    .use(commonmark)
    .use(history)
  let replacement: EditorView | undefined
  try {
    await editor.create()
    const original = editor.action((ctx) => ctx.get(editorViewCtx))
    original.dispatch(original.state.tr.insertText(' Changed', 9))
    const state = original.state
    expect(undoDepth(state)).toBe(1)
    original.destroy()
    replacement = new EditorView(root, { state })
    expect(replacement.state).toBe(state)
    expect(undo(replacement.state, replacement.dispatch)).toBe(true)
    expect(replacement.state.doc.textContent).toBe('Original')
    expect(redo(replacement.state, replacement.dispatch)).toBe(true)
    expect(replacement.state.doc.textContent).toBe('Original Changed')
    editor.action((ctx) => {
      expect(ctx.get(editorStateCtx)).toBe(replacement!.state)
      // Updating the public context does not update the view plugin's closed-
      // over original instance. Destroy still owns that original instance.
      ctx.set(editorViewCtx, replacement!)
    })
    await editor.destroy()
    expect(replacement.isDestroyed).toBe(false)
  } finally {
    replacement?.destroy()
    await editor.destroy()
    root.remove()
  }
})

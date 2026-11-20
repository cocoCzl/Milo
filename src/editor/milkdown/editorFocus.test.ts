import { expect, it, vi } from 'vitest'
import type { EditorView } from '@milkdown/prose/view'
import { focusEditorElement, registerEditorFocusTarget } from './editorFocus'

it('restores a registered editor through its model selection and unregisters on destruction', () => {
  const dom = document.createElement('div')
  const nativeFocus = vi.spyOn(dom, 'focus')
  const modelFocus = vi.fn()
  const view = { dom, focus: modelFocus, editable: true } as unknown as EditorView
  const unregister = registerEditorFocusTarget(view)
  focusEditorElement(dom)
  expect(modelFocus).toHaveBeenCalledTimes(1)
  expect(nativeFocus).not.toHaveBeenCalled()
  unregister()
  focusEditorElement(dom)
  expect(modelFocus).toHaveBeenCalledTimes(1)
  expect(nativeFocus).toHaveBeenCalledTimes(1)
})

it('preserves ordinary control focus without registering an editor', () => {
  const button = document.createElement('button')
  const nativeFocus = vi.spyOn(button, 'focus')
  focusEditorElement(button)
  expect(nativeFocus).toHaveBeenCalledTimes(1)
})

import { describe, expect, it } from 'vitest'

import { isSafariCompositionReplacementBreak } from './safariCompositionHardbreak'

describe('Safari composition hardbreak boundary', () => {
  it('recognizes only the transient bare BR shapes during composition deletion', () => {
    const editor = document.createElement('div')
    editor.className = 'ProseMirror'
    editor.innerHTML = '<br><p>First body paragraph</p>'
    expect(isSafariCompositionReplacementBreak(editor.firstChild!, true)).toBe(true)
    expect(isSafariCompositionReplacementBreak(editor.firstChild!, false)).toBe(false)

    editor.innerHTML = '<p><br></p><p>First body paragraph</p>'
    expect(isSafariCompositionReplacementBreak(editor.querySelector('br')!, true)).toBe(true)

    editor.innerHTML = '<p><br data-type="hardbreak" data-is-inline="false"></p>'
    expect(isSafariCompositionReplacementBreak(editor.querySelector('br')!, true)).toBe(false)
  })
})

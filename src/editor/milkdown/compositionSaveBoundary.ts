import { Plugin } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'

export type EditorComposition = { phase: 'composing' } | { phase: 'settled'; markdown: string }

// compositionend precedes ProseMirror's DOM observer flush (and may precede
// WKWebView's final input). Keep the save boundary closed until both DOM and
// editor state have stopped changing across consecutive rendering frames.
export function createCompositionSaveBoundary(
  serialize: (view: EditorView) => string,
  notify: (state: EditorComposition) => void,
) {
  let composing = false
  let ending = false
  let frame: number | null = null
  let stableFrames = 0
  let previousDoc: EditorView['state']['doc'] | null = null
  let previousDOM = ''
  let destroyed = false

  const cancelFrame = () => {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
  }
  const settle = (view: EditorView) => {
    frame = null
    if (destroyed || !ending) return
    const dom = view.dom.innerHTML
    if (!view.composing && previousDoc === view.state.doc && previousDOM === dom) stableFrames++
    else stableFrames = 0
    previousDoc = view.state.doc
    previousDOM = dom
    if (stableFrames >= 2) {
      ending = false
      composing = false
      notify({ phase: 'settled', markdown: serialize(view) })
    } else {
      frame = window.requestAnimationFrame(() => settle(view))
    }
  }
  const changed = () => {
    stableFrames = 0
  }
  const start = () => {
    cancelFrame()
    ending = false
    stableFrames = 0
    if (!composing) {
      composing = true
      notify({ phase: 'composing' })
    }
    return false
  }

  return new Plugin({
    props: {
      handleDOMEvents: {
        compositionstart: start,
        compositionupdate: start,
        compositionend: (view) => {
          if (composing) {
            ending = true
            changed()
            cancelFrame()
            frame = window.requestAnimationFrame(() => settle(view))
          }
          return false
        },
        input: () => {
          changed()
          return false
        },
      },
    },
    view: (view) => {
      const observer = new MutationObserver(changed)
      observer.observe(view.dom, { childList: true, subtree: true, characterData: true })
      return {
        update: changed,
        destroy: () => {
          destroyed = true
          cancelFrame()
          observer.disconnect()
        },
      }
    },
  })
}

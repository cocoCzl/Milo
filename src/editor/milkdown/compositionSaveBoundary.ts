import { Plugin } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'

export type EditorComposition = { phase: 'composing' } | { phase: 'settled'; markdown: string }

const pendingViews = new WeakSet<EditorView>()
export const hasPendingComposition = (view: EditorView) => view.composing || pendingViews.has(view)

// Timers keep working when WKWebView suspends animation frames. A timer is
// only a sampling opportunity, never permission to save: both the immutable
// document and DOM mutation generation must stay stable, with IME inactive.
export function createCompositionSaveBoundary(
  serialize: (view: EditorView) => string,
  notify: (state: EditorComposition) => void,
) {
  let ending = false
  let timer: number | undefined
  let stableSamples = 0
  let generation = 0
  let previousGeneration = -1
  let previousDoc: EditorView['state']['doc'] | null = null
  let observer: MutationObserver | undefined
  let destroyed = false

  const cancel = () => window.clearTimeout(timer)
  const changed = () => {
    generation++
    stableSamples = 0
  }
  const settle = (view: EditorView) => {
    if (destroyed || !ending) return
    if (observer?.takeRecords().length) changed()
    if (!view.composing && previousDoc === view.state.doc && previousGeneration === generation)
      stableSamples++
    else stableSamples = 0
    previousDoc = view.state.doc
    previousGeneration = generation
    if (stableSamples >= 2) {
      ending = false
      pendingViews.delete(view)
      notify({ phase: 'settled', markdown: serialize(view) })
    } else timer = window.setTimeout(() => settle(view), 20)
  }
  const start = (view: EditorView) => {
    cancel()
    ending = false
    changed()
    if (!pendingViews.has(view)) {
      pendingViews.add(view)
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
          if (pendingViews.has(view)) {
            ending = true
            changed()
            cancel()
            timer = window.setTimeout(() => settle(view), 20)
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
      observer = new MutationObserver(changed)
      observer.observe(view.dom, { childList: true, subtree: true, characterData: true })
      return {
        update: (_view, previous) => {
          if (previous.doc !== view.state.doc) changed()
        },
        destroy: () => {
          destroyed = true
          cancel()
          pendingViews.delete(view)
          observer?.disconnect()
        },
      }
    },
  })
}

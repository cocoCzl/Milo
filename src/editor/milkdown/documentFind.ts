import { closeHistory } from '@milkdown/prose/history'
import { hasPendingComposition } from './compositionSaveBoundary'
import type { Node } from '@milkdown/prose/model'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/prose/view'

type Match = { from: number; to: number }
export type FindState = {
  query: string
  matchCase: boolean
  matches: Match[]
  current: number
  decorations: DecorationSet
}
export const findKey = new PluginKey<FindState>('milo-document-find')
const indexes = new WeakMap<Node, { pos: number; text: string; folded: string }[]>()
const fold = (text: string) => text.replace(/[A-Z]/g, (char) => char.toLowerCase())

export function findMatches(doc: Node, query: string, matchCase = false): Match[] {
  if (!query || query.includes('\ufffc')) return []
  let index = indexes.get(doc)
  if (!index) {
    index = []
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return
      let text = ''
      node.forEach((child) => {
        text += child.isText ? child.text! : '\ufffc'.repeat(child.nodeSize)
      })
      index!.push({ pos: pos + 1, text, folded: fold(text) })
      return false
    })
    indexes.set(doc, index)
  }
  const needle = matchCase ? query : fold(query)
  const matches: Match[] = []
  for (const entry of index) {
    const { pos } = entry
    const text = matchCase ? entry.text : entry.folded
    let offset = 0
    while ((offset = text.indexOf(needle, offset)) !== -1) {
      matches.push({ from: pos + offset, to: pos + offset + query.length })
      offset += query.length
    }
  }
  return matches
}

export function createDocumentFind(notify: (state: FindState) => void) {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => ({
        query: '',
        matchCase: false,
        matches: [],
        current: -1,
        decorations: DecorationSet.empty,
      }),
      apply: (tr, previous) => {
        const action = tr.getMeta(findKey) as
          | { query?: string; matchCase?: boolean; matches?: Match[]; current?: number }
          | undefined
        if (!action && (!tr.docChanged || !previous.query)) return previous
        const query = action?.query ?? previous.query
        const matchCase = action?.matchCase ?? previous.matchCase
        const matches =
          action?.matches ??
          (tr.docChanged || query !== previous.query || matchCase !== previous.matchCase
            ? []
            : previous.matches)
        const current = matches.length
          ? Math.max(0, Math.min(action?.current ?? previous.current, matches.length - 1))
          : -1
        const decorations = matches.length
          ? DecorationSet.create(
              tr.doc,
              matches
                .slice(Math.max(0, current - 250), Math.max(500, current + 250))
                .map((match, offset) =>
                  Decoration.inline(match.from, match.to, {
                    class:
                      offset + Math.max(0, current - 250) === current
                        ? 'document-find-match document-find-match--current'
                        : 'document-find-match',
                  }),
                ),
            )
          : DecorationSet.empty
        return { query, matchCase, matches, current, decorations }
      },
    },
    props: { decorations: (state) => findKey.getState(state)?.decorations },
    view: (view) => {
      let timer: number | undefined
      let previousDoc = view.state.doc
      let previousQuery = ''
      let previousCase = false
      const schedule = () => {
        window.clearTimeout(timer)
        const state = findKey.getState(view.state)!
        if (!state.query) return
        timer = window.setTimeout(() => {
          const latest = findKey.getState(view.state)!
          const matches = findMatches(view.state.doc, latest.query, latest.matchCase)
          view.dispatch(view.state.tr.setMeta(findKey, { matches }).setMeta('addToHistory', false))
        }, 100)
      }
      return {
        update: () => {
          const state = findKey.getState(view.state)!
          if (
            previousDoc !== view.state.doc ||
            previousQuery !== state.query ||
            previousCase !== state.matchCase
          ) {
            previousDoc = view.state.doc
            previousQuery = state.query
            previousCase = state.matchCase
            schedule()
          }
          notify(state)
        },
        destroy: () => window.clearTimeout(timer),
      }
    },
  })
}

export function setFindQuery(view: EditorView, query: string, matchCase = false) {
  view.dispatch(view.state.tr.setMeta(findKey, { query, matchCase }).setMeta('addToHistory', false))
}
export function moveFindMatch(view: EditorView, direction: number) {
  const state = findKey.getState(view.state)!
  if (!state.matches.length) return
  const current = (state.current + direction + state.matches.length) % state.matches.length
  view.dispatch(view.state.tr.setMeta(findKey, { current }).setMeta('addToHistory', false))
  // DOM is measured for scrolling only; neither selection nor content changes.
  const match = view.dom.querySelector<HTMLElement>('.document-find-match--current')
  const stage = view.dom.closest<HTMLElement>('.document-stage')
  if (match && stage) {
    const rect = match.getBoundingClientRect(),
      root = stage.getBoundingClientRect()
    if (rect.top < root.top + 48 || rect.bottom > root.bottom - 24)
      stage.scrollTop += rect.top - root.top - stage.clientHeight / 3
  } else match?.scrollIntoView?.({ block: 'nearest' })
}

// Literal matches span inline formatting in one textblock; they never cross
// paragraphs, cells, code blocks or inline atoms. Replacements inherit marks
// at the match start. All replacements form one explicit undo step.
export function replaceFindMatches(view: EditorView, replacement: string, all = false) {
  if (!view.editable || hasPendingComposition(view) || /[\r\n]/.test(replacement)) return false
  const state = findKey.getState(view.state)
  if (!state?.query) return false
  const matches = findMatches(view.state.doc, state.query, state.matchCase)
  const selected = all
    ? matches
    : matches.slice(Math.max(0, state.current), Math.max(0, state.current) + 1)
  if (!selected.length) return false
  const tr = closeHistory(view.state.tr)
  for (const match of [...selected].reverse()) {
    const marks =
      view.state.doc.nodeAt(match.from)?.marks ?? view.state.doc.resolve(match.from).marks()
    tr.replaceWith(
      match.from,
      match.to,
      replacement ? view.state.schema.text(replacement, marks) : [],
    )
  }
  view.dispatch(tr)
  view.dispatch(closeHistory(view.state.tr))
  return true
}

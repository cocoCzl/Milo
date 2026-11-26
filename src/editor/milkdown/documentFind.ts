import { closeHistory, isHistoryTransaction } from '@milkdown/prose/history'
import { hasPendingComposition } from './compositionSaveBoundary'
import type { Node } from '@milkdown/prose/model'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/prose/view'

import { noFindMatches, runFindTask, scanMatches, type MatchPositions } from './documentFindMatches'
import { prepareFindReplacement } from './documentFindReplace'
import { observeFindKeys, traceFind } from './findTrace'
import { inputTraceEnabled, inputTraceVersion } from '../../diagnostics/inputTrace'
export { findMatches } from './documentFindMatches'

export type FindState = {
  query: string
  matchCase: boolean
  matches: MatchPositions
  current: number
  decorations: DecorationSet
  resultDoc: Node | null
  busy: boolean
  replacing: boolean
}
export const findKey = new PluginKey<FindState>('milo-document-find')
const replacements = new WeakMap<EditorView, AbortController>()
const owners = new WeakMap<EditorView, () => boolean>()
let nextRequest = 0

export function createDocumentFind(notify: (state: FindState) => void, isActive = () => true) {
  let traceView: EditorView | null = null
  return new Plugin<FindState>({
    appendTransaction: (transactions, previous, current) => {
      if (inputTraceEnabled && traceView)
        traceFind(
          traceView,
          'transaction',
          {
            previousDocVersion: inputTraceVersion(previous.doc),
            history: transactions.some(isHistoryTransaction),
            steps: transactions.reduce((sum, tr) => sum + tr.steps.length, 0),
            query: findKey.getState(current)?.query ?? '',
            replacing: findKey.getState(current)?.replacing ?? false,
          },
          current,
        )
      return null
    },
    key: findKey,
    state: {
      init: () => ({
        query: '',
        matchCase: false,
        matches: noFindMatches,
        current: -1,
        decorations: DecorationSet.empty,
        resultDoc: null,
        busy: false,
        replacing: false,
      }),
      apply: (tr, previous) => {
        const action = tr.getMeta(findKey) as
          | {
              query?: string
              matchCase?: boolean
              matches?: MatchPositions
              current?: number
              resultDoc?: Node
              busy?: boolean
              replacing?: boolean
            }
          | undefined
        if (!action && (!tr.docChanged || !previous.query)) return previous
        const query = action?.query ?? previous.query
        const matchCase = action?.matchCase ?? previous.matchCase
        const invalidated =
          tr.docChanged || query !== previous.query || matchCase !== previous.matchCase
        const matches = action?.matches ?? (invalidated ? noFindMatches : previous.matches)
        const current = matches.length
          ? Math.max(0, Math.min(action?.current ?? previous.current, matches.length - 1))
          : -1
        const start = Math.max(0, current - 250)
        const decorations = matches.length
          ? DecorationSet.create(
              tr.doc,
              Array.from({ length: Math.min(500, matches.length - start) }, (_, offset) =>
                Decoration.inline(matches.from(start + offset), matches.to(start + offset), {
                  class:
                    start + offset === current
                      ? 'document-find-match document-find-match--current'
                      : 'document-find-match',
                }),
              ),
            )
          : DecorationSet.empty
        return {
          query,
          matchCase,
          matches,
          current,
          decorations,
          resultDoc: action?.resultDoc ?? (invalidated ? null : previous.resultDoc),
          busy: action?.busy ?? (invalidated ? Boolean(query) : previous.busy),
          replacing: invalidated ? false : (action?.replacing ?? previous.replacing),
        }
      },
    },
    props: { decorations: (state) => findKey.getState(state)?.decorations },
    view: (view) => {
      owners.set(view, isActive)
      traceView = view
      const stopTrace = observeFindKeys(view)
      const cancelOnHistoryIntent = (event: Event) => {
        if (!isActive()) return
        const keyboard = event as KeyboardEvent
        const input = event as InputEvent
        const historyIntent =
          event.type === 'keydown'
            ? (keyboard.metaKey || keyboard.ctrlKey) &&
              keyboard.key.toLowerCase() === 'z' &&
              !keyboard.isComposing
            : ['historyUndo', 'historyRedo'].includes(input.inputType) && !input.isComposing
        if (!historyIntent) return
        const owner = view.dom.ownerDocument
        const root = view.dom.closest('.milkdown-editor') ?? view.dom
        const focused = owner.activeElement
        if (
          focused !== owner.body &&
          focused !== owner.documentElement &&
          !(event.target instanceof globalThis.Node && root.contains(event.target))
        )
          return
        const pending = replacements.get(view)
        if (!pending) return
        if (inputTraceEnabled)
          traceFind(view, 'replace-cancel', {
            source: 'history-intent',
            inputType: input.inputType ?? '',
          })
        pending.abort()
        // Preserve native input-field undo and the editor history keymap.
        // An empty history may dispatch nothing, so doc identity alone cannot
        // invalidate preparation after the user has requested Undo/Redo.
      }
      const eventOwner = view.dom.ownerDocument
      eventOwner.addEventListener('keydown', cancelOnHistoryIntent, true)
      eventOwner.addEventListener('beforeinput', cancelOnHistoryIntent, true)
      let timer: number | undefined
      let controller: AbortController | undefined
      let previousDoc = view.state.doc
      let previousQuery = ''
      let previousCase = false
      const schedule = () => {
        window.clearTimeout(timer)
        controller?.abort()
        replacements.get(view)?.abort()
        const state = findKey.getState(view.state)!
        if (!state.query) return
        const doc = view.state.doc,
          { query, matchCase } = state
        const request = new AbortController()
        controller = request
        timer = window.setTimeout(() => {
          void runFindTask(scanMatches(doc, query, matchCase), request.signal)
            .then((matches) => {
              if (
                request.signal.aborted ||
                view.isDestroyed ||
                !isActive() ||
                view.state.doc !== doc
              )
                return
              const latest = findKey.getState(view.state)!
              if (latest.query !== query || latest.matchCase !== matchCase) return
              view.dispatch(
                view.state.tr
                  .setMeta(findKey, { matches, resultDoc: doc, busy: false })
                  .setMeta('addToHistory', false),
              )
            })
            .catch((reason) => {
              if (!request.signal.aborted) throw reason
            })
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
        destroy: () => {
          owners.delete(view)
          stopTrace()
          eventOwner.removeEventListener('keydown', cancelOnHistoryIntent, true)
          eventOwner.removeEventListener('beforeinput', cancelOnHistoryIntent, true)
          traceView = null
          window.clearTimeout(timer)
          controller?.abort()
          replacements.get(view)?.abort()
        },
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
export async function replaceFindMatches(view: EditorView, replacement: string, all = false) {
  if (!view.editable || hasPendingComposition(view) || /[\r\n]/.test(replacement)) return false
  const state = findKey.getState(view.state)
  if (!state?.query) return false
  replacements.get(view)?.abort()
  const request = new AbortController()
  const requestId = ++nextRequest
  let committed = false
  replacements.set(view, request)
  if (inputTraceEnabled)
    traceFind(view, 'replace-request', { requestId, query: state.query, replacement, all })
  const doc = view.state.doc,
    { query, matchCase } = state
  const valid = () =>
    !request.signal.aborted &&
    !view.isDestroyed &&
    owners.get(view)?.() !== false &&
    view.editable &&
    !hasPendingComposition(view) &&
    view.state.doc === doc &&
    findKey.getState(view.state)?.query === query &&
    findKey.getState(view.state)?.matchCase === matchCase
  view.dispatch(view.state.tr.setMeta(findKey, { replacing: true }).setMeta('addToHistory', false))
  try {
    const matches =
      state.resultDoc === doc
        ? state.matches
        : await runFindTask(scanMatches(doc, query, matchCase), request.signal)
    if (!matches.length || !valid()) return false
    let tr = closeHistory(view.state.tr)
    if (all) {
      const prepared = await runFindTask(
        prepareFindReplacement(doc, matches, replacement),
        request.signal,
      )
      if (inputTraceEnabled)
        traceFind(view, 'replace-prepared', { requestId, aborted: request.signal.aborted })
      if (!valid()) return false
      tr = closeHistory(view.state.tr)
      tr.replaceWith(0, doc.content.size, prepared.doc.content)
      tr.setSelection(view.state.selection.map(tr.doc, prepared.mapping))
    } else {
      const index = Math.max(0, Math.min(state.current, matches.length - 1))
      const from = matches.from(index),
        to = matches.to(index)
      const marks = doc.nodeAt(from)?.marks ?? doc.resolve(from).marks()
      tr.replaceWith(from, to, replacement ? view.state.schema.text(replacement, marks) : [])
    }
    // All preparation used an immutable snapshot. Check again at the dispatch
    // boundary; edits, closing Find, tab changes or newer requests invalidate it.
    if (!valid()) return false
    if (inputTraceEnabled) traceFind(view, 'replace-commit', { requestId })
    view.dispatch(tr)
    committed = true
    if (inputTraceEnabled) traceFind(view, 'replace-committed', { requestId })
    view.dispatch(closeHistory(view.state.tr))
    return true
  } catch (reason) {
    if (request.signal.aborted) return false
    throw reason
  } finally {
    if (inputTraceEnabled && !view.isDestroyed)
      traceFind(view, 'replace-finished', {
        requestId,
        committed,
        outcome: committed ? 'committed' : request.signal.aborted ? 'cancelled' : 'discarded',
      })
    if (replacements.get(view) === request) {
      replacements.delete(view)
      if (!view.isDestroyed)
        view.dispatch(
          view.state.tr.setMeta(findKey, { replacing: false }).setMeta('addToHistory', false),
        )
    }
  }
}

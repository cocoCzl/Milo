import type { EditorState } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import type { EditorHeading } from './EditorOutline'

const headingScrollOffset = 24

// WebKit may report a fractional residual after a scroll is clamped at the
// end of a long document.  Treat the final few pixels as the bottom so the
// last visible heading, rather than its predecessor, wins the active state.
const scrollBottomTolerance = 8

const headingActivationTolerance = 2

export type PendingHeadingNavigation = {
  pos: number
}

export function headingScrollTop(stage: HTMLElement, heading: HTMLElement): number {
  const stageRect = stage.getBoundingClientRect()
  const headingRect = heading.getBoundingClientRect()
  const maxScrollTop = Math.max(0, stage.scrollHeight - stage.clientHeight)
  const targetTop = stage.scrollTop + headingRect.top - stageRect.top - headingScrollOffset
  return Math.min(maxScrollTop, Math.max(0, targetTop))
}

type HeadingDomCache = {
  doc: EditorState['doc']
  elementsById: ReadonlyMap<string, HTMLElement>
}

// Milkdown's built-in heading-id plugin assigns a unique `id` to every
// non-empty heading.  Unlike `nodeDOM(position)`, that id survives the
// ProseMirror block-boundary ambiguity seen in WKWebView.  It is also more
// reliable than pairing heading nodes and DOM elements by their list indexes:
// an editor extension may add a heading-like DOM node without changing the
// document model.  Navigation therefore resolves the active editor's current
// heading through the same unique id used in the outline model.
const headingDomCaches = new WeakMap<EditorView, HeadingDomCache>()

function headingElementsById(editorView: EditorView): ReadonlyMap<string, HTMLElement> {
  const cached = headingDomCaches.get(editorView)
  if (
    cached?.doc === editorView.state.doc &&
    Array.from(cached.elementsById.values()).every((element) => editorView.dom.contains(element))
  )
    return cached.elementsById

  const elementsById = new Map<string, HTMLElement>()
  editorView.dom
    .querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')
    .forEach((element) => {
      if (element.id && !elementsById.has(element.id)) elementsById.set(element.id, element)
    })

  headingDomCaches.set(editorView, { doc: editorView.state.doc, elementsById })
  return elementsById
}

export function headingElement(editorView: EditorView, heading: EditorHeading): HTMLElement | null {
  const node = editorView.state.doc.nodeAt(heading.pos)
  if (
    node?.type.name !== 'heading' ||
    node.textContent.trim() !== heading.text ||
    Number(node.attrs.level) !== heading.level ||
    node.attrs.id !== heading.id
  ) {
    return null
  }

  const element = headingElementsById(editorView).get(heading.id)
  if (!element) return null
  if (
    element.tagName.toLowerCase() !== `h${heading.level}` ||
    element.textContent?.trim() !== heading.text
  ) {
    return null
  }
  return element
}

export function headingAtSelection(
  state: EditorState,
  headingsByPosition: ReadonlyMap<number, EditorHeading>,
): number | null {
  for (let depth = state.selection.$from.depth; depth > 0; depth -= 1) {
    if (state.selection.$from.node(depth).type.name !== 'heading') continue
    const position = state.selection.$from.before(depth)
    return headingsByPosition.has(position) ? position : null
  }
  return null
}

export function activeHeadingFromScroll(
  headings: EditorHeading[],
  getElement: (pos: number) => HTMLElement | null,
  stage: HTMLElement,
): number | null {
  if (headings.length === 0) return null

  const stageRect = stage.getBoundingClientRect()
  const remainingScroll = Math.max(0, stage.scrollHeight - stage.clientHeight - stage.scrollTop)
  // The final document padding and WebKit fractional layout mean strict
  // equality with maxScrollTop is not dependable.  Once the remaining travel
  // is visually negligible, use the last heading actually intersecting the
  // article viewport so the final chapters can become active.
  const bottomThreshold = Math.max(scrollBottomTolerance, Math.min(48, stage.clientHeight * 0.08))
  const isAtBottom = remainingScroll <= bottomThreshold
  const activationLine = stageRect.top + headingScrollOffset + headingActivationTolerance
  let current = headings[0].pos
  let lastVisible: number | null = null

  for (const heading of headings) {
    const element = getElement(heading.pos)
    if (!element) continue
    const rect = element.getBoundingClientRect()
    if (rect.bottom > stageRect.top && rect.top < stageRect.bottom) lastVisible = heading.pos
    if (!isAtBottom && rect.top <= activationLine) current = heading.pos
  }

  return isAtBottom ? (lastVisible ?? headings[headings.length - 1].pos) : current
}

export function readHeadings(state: EditorState): EditorHeading[] {
  const headings: EditorHeading[] = []

  state.doc.descendants((node, position) => {
    if (node.type.name !== 'heading') return
    const text = node.textContent.trim()
    const id = typeof node.attrs.id === 'string' ? node.attrs.id : ''
    // The Milkdown heading-id plugin fills this during editor initialization.
    // If it has not completed yet, do not expose a navigable heading that
    // could resolve to a different DOM node; the next document update supplies
    // the stable id and publishes it to the outline.
    if (text && id)
      headings.push({ id, key: id, level: Number(node.attrs.level) || 1, pos: position, text })
  })

  return headings
}

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

export function headingElementResolver(editorView: EditorView) {
  // Validate once for a navigation/scroll pass, rather than H times for H headings.
  const elements = headingElementsById(editorView)
  return (heading: EditorHeading): HTMLElement | null => {
    const node = editorView.state.doc.nodeAt(heading.pos)
    if (
      node?.type.name !== 'heading' ||
      node.textContent.trim() !== heading.text ||
      Number(node.attrs.level) !== heading.level ||
      node.attrs.id !== heading.id
    ) {
      return null
    }

    const element = elements.get(heading.id)
    if (!element) return null
    if (
      element.tagName.toLowerCase() !== `h${heading.level}` ||
      element.textContent?.trim() !== heading.text
    ) {
      return null
    }
    return element
  }
}

export function headingElement(editorView: EditorView, heading: EditorHeading) {
  return headingElementResolver(editorView)(heading)
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
  // Heading DOM order matches document order. Read live geometry so image
  // loads, resizing, zoom and font changes require no position-cache repair.
  const line = isAtBottom ? stageRect.bottom : activationLine
  let low = 0
  let high = headings.length
  while (low < high) {
    const mid = (low + high) >>> 1
    const element = getElement(headings[mid].pos)
    if (!element) return null // Stale model/DOM: wait for the next document update.
    const top = element.getBoundingClientRect().top
    if (isAtBottom ? top < line : top <= line) low = mid + 1
    else high = mid
  }
  const index = Math.max(0, low - 1)
  if (!isAtBottom) return headings[index].pos
  const rect = getElement(headings[index].pos)?.getBoundingClientRect()
  return rect && rect.bottom > stageRect.top ? headings[index].pos : headings.at(-1)!.pos
}

// ProseMirror structurally shares unchanged nodes. Cache relative headings by
// subtree identity; editing an ordinary paragraph never traverses its text or
// the contents of unchanged tables, quotes and lists.
const subtreeHeadings = new WeakMap<EditorState['doc'], EditorHeading[]>()
function headingsInNode(node: EditorState['doc']): EditorHeading[] {
  const cached = subtreeHeadings.get(node)
  if (cached) return cached
  const result: EditorHeading[] = []
  if (node.type.name === 'heading') {
    const text = node.textContent.trim()
    const id = typeof node.attrs.id === 'string' ? node.attrs.id : ''
    if (text && id) result.push({ id, key: id, level: Number(node.attrs.level) || 1, pos: 0, text })
  } else if (!node.isTextblock) {
    node.forEach((child, offset) => {
      for (const heading of headingsInNode(child))
        result.push({ ...heading, pos: offset + (node.type.name === 'doc' ? 0 : 1) + heading.pos })
    })
  }
  subtreeHeadings.set(node, result)
  return result
}

export function readHeadings(state: EditorState): EditorHeading[] {
  return headingsInNode(state.doc)
}

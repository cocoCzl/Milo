import type { Node } from '@milkdown/prose/model'

export type Match = { from: number; to: number }

// Keep every result, using two integers rather than an object per occurrence.
// Very large documents use Float64 positions instead of silently wrapping uint32.
export class MatchPositions implements Iterable<Match> {
  constructor(private readonly positions: Uint32Array | Float64Array) {}
  get length() {
    return this.positions.length / 2
  }
  from(index: number) {
    return this.positions[index * 2]
  }
  to(index: number) {
    return this.positions[index * 2 + 1]
  }
  *[Symbol.iterator]() {
    for (let i = 0; i < this.length; i++) yield { from: this.from(i), to: this.to(i) }
  }
}
export const noFindMatches = new MatchPositions(new Uint32Array(0))
const texts = new WeakMap<Node, string>()

// ECMAScript Unicode simple case folding (/iu), with no locale tailoring,
// normalization, accent removal or multi-character expansion (ß is not ss).
// RegExp indices and matched lengths always refer to the original UTF-16 text.
function literalPattern(query: string, matchCase: boolean) {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu')
}

function* textblocks(node: Node, pos = -1): Generator<{ node: Node; pos: number } | null> {
  if (node.isTextblock) {
    yield { node, pos: pos + 1 }
    return
  }
  let offset = pos + 1
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (!child.isLeaf) yield* textblocks(child, offset)
    offset += child.nodeSize
    // Empty containers also need a cancellation/scheduling opportunity.
    yield null
  }
}

export function* scanMatches(doc: Node, query: string, matchCase = false) {
  if (!query || query.includes('\ufffc')) return noFindMatches
  const pattern = literalPattern(query, matchCase)
  const Positions = doc.content.size > 0xffffffff ? Float64Array : Uint32Array
  let positions = new Positions(2048)
  let size = 0
  for (const entry of textblocks(doc)) {
    if (!entry) {
      yield
      continue
    }
    let text = texts.get(entry.node)
    if (text === undefined) {
      const parts: string[] = []
      for (let i = 0; i < entry.node.childCount; i++) {
        const child = entry.node.child(i)
        parts.push(child.isText ? child.text! : '\ufffc'.repeat(child.nodeSize))
        if (i % 256 === 255) yield
      }
      text = parts.join('')
      texts.set(entry.node, text)
    }
    // Bound a no-match regexp scan too. Overlap covers a literal crossing a
    // window edge; accepting only starts before end prevents duplicates.
    const width = Math.max(32768, query.length * 2)
    let consumed = 0
    for (let start = 0; start < text.length; start += width) {
      const end = Math.min(text.length, start + width)
      const window = text.slice(start, Math.min(text.length, end + query.length + 2))
      pattern.lastIndex = Math.max(0, consumed - start)
      let match: RegExpExecArray | null
      let inSlice = 0
      while ((match = pattern.exec(window)) && start + match.index < end) {
        if (size === positions.length) {
          const grown = new Positions(positions.length * 2)
          grown.set(positions)
          positions = grown
        }
        const from = start + match.index
        positions[size++] = entry.pos + from
        consumed = from + match[0].length
        positions[size++] = entry.pos + consumed
        if (++inSlice % 1024 === 0) yield
      }
      yield
    }
  }
  return size ? new MatchPositions(positions.slice(0, size)) : noFindMatches
}

export function findMatches(doc: Node, query: string, matchCase = false) {
  const task = scanMatches(doc, query, matchCase)
  let next = task.next()
  while (!next.done) next = task.next()
  return next.value
}

// Each slice yields to the event loop; no task may publish without revalidating
// its immutable document and query. Cancellation never publishes partial counts.
export async function runFindTask<T>(task: Generator<void, T>, signal: AbortSignal): Promise<T> {
  while (true) {
    signal.throwIfAborted()
    const deadline = performance.now() + 4
    let next: IteratorResult<void, T>
    do {
      next = task.next()
      if (next.done) {
        signal.throwIfAborted()
        return next.value
      }
    } while (performance.now() < deadline)
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, 0)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
}

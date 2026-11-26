import { Fragment, Mark, type Node } from '@milkdown/prose/model'
import { StepMap } from '@milkdown/prose/transform'
import type { MatchPositions } from './documentFindMatches'

// Prepare a structurally shared document instead of building one transform and
// mapping per match. Inline text is joined per mark run, avoiding quadratic
// string rebuilding in a large textblock. The eventual dispatch is one undo step.
export function* prepareFindReplacement(doc: Node, matches: MatchPositions, replacement: string) {
  let matchIndex = 0
  const ranges: number[] = []
  function* visit(node: Node, pos: number): Generator<void, Node> {
    if (matchIndex >= matches.length || matches.from(matchIndex) >= pos + node.nodeSize) return node
    if (node.isTextblock) {
      if (matches.from(matchIndex) < pos + 1 || matches.from(matchIndex) >= pos + node.nodeSize - 1)
        return node
      const output: Node[] = []
      let parts: string[] = []
      let marks: readonly Mark[] = Mark.none
      const flush = () => {
        if (parts.length) output.push(node.type.schema.text(parts.join(''), marks))
        parts = []
      }
      const append = (text: string, nextMarks: readonly Mark[]) => {
        if (!text) return
        if (!Mark.sameSet(marks, nextMarks)) {
          flush()
          marks = nextMarks
        }
        parts.push(text)
      }
      let childIndex = 0
      let child = node.child(0)
      let childStart = pos + 1
      let cursor = childStart
      const advance = (to: number, keep: boolean) => {
        while (cursor < to) {
          const end = Math.min(to, childStart + child.nodeSize)
          if (keep) {
            if (child.isText)
              append(child.text!.slice(cursor - childStart, end - childStart), child.marks)
            else {
              flush()
              output.push(child)
            }
          }
          cursor = end
          if (cursor === childStart + child.nodeSize && childIndex + 1 < node.childCount) {
            childStart = cursor
            child = node.child(++childIndex)
          }
        }
      }
      while (matchIndex < matches.length && matches.from(matchIndex) < pos + node.nodeSize - 1) {
        const from = matches.from(matchIndex),
          to = matches.to(matchIndex)
        advance(from, true)
        append(replacement, child.marks)
        advance(to, false)
        ranges.push(from, to - from, replacement.length)
        matchIndex++
        if (matchIndex % 1024 === 0) yield
      }
      advance(pos + node.nodeSize - 1, true)
      flush()
      yield
      return node.copy(Fragment.fromArray(output))
    }
    if (node.isLeaf) return node
    const children: Node[] = []
    let offset = pos + 1
    let changed = false
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      const next = yield* visit(child, offset)
      children.push(next)
      changed ||= next !== child
      offset += child.nodeSize
      yield
    }
    return changed ? node.copy(Fragment.fromArray(children)) : node
  }
  const nextDoc = yield* visit(doc, -1)
  return { doc: nextDoc, mapping: new StepMap(ranges) }
}

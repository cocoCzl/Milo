import type { Node } from '@milkdown/prose/model'
import type { SerializerState } from '@milkdown/transformer'
import { miloTableCellAlignment, miloTableHeaderAlignment } from './tableAlignment'

// `@milkdown/preset-commonmark` intentionally serializes an otherwise-empty
// paragraph as `<br />` when its preserve-empty-line remark plugin is active.
// A GFM table cell always contains a paragraph, even when the semantic cell is
// empty.  That paragraph is structural table content, not an authored blank
// line, so emit an empty `tableCell` AST node instead of serializing that one
// empty paragraph.  remark-gfm then writes a standard empty Markdown cell.
//
// This is deliberately attached only to table_cell/table_header serializers.
// Any non-empty paragraph is delegated to Milkdown unchanged, including an
// authored HTML node such as `<br />`.
function serializeTableCell(state: SerializerState, node: Node) {
  state.openNode('tableCell')
  const onlyChild = node.childCount === 1 ? node.firstChild : null
  const isStructuralEmptyParagraph = onlyChild?.type.name === 'paragraph' && onlyChild.content.size === 0
  if (!isStructuralEmptyParagraph) state.next(node.content)
  state.closeNode()
}

export const miloEmptyTableCellSerializer = [
  miloTableCellAlignment.extendSchema((base) => (ctx) => ({
    ...base(ctx),
    toMarkdown: {
      match: (node) => node.type.name === 'table_cell',
      runner: serializeTableCell,
    },
  })),
  miloTableHeaderAlignment.extendSchema((base) => (ctx) => ({
    ...base(ctx),
    toMarkdown: {
      match: (node) => node.type.name === 'table_header',
      runner: serializeTableCell,
    },
  })),
].flat()

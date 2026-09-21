import { tableCellSchema, tableHeaderSchema } from '@milkdown/preset-gfm'
import type { Ctx } from '@milkdown/ctx'
import type { Node as ProseNode } from '@milkdown/prose/model'
import type { NodeSchema } from '@milkdown/transformer'

// GFM distinguishes an omitted table alignment (`---`) from explicit left
// alignment (`:---`).  Milkdown's stock schema collapses both into `left`,
// which makes it impossible for Milo to give new/unspecified columns their
// own visual default. Keep null in the document for the omitted form and only
// write an inline style when an alignment was explicitly authored.
type TableCellDom = HTMLElement

function readTableCellAttrs(dom: TableCellDom) {
  const widthAttr = dom.getAttribute('data-colwidth')
  const widths = widthAttr && /^\d+(,\d+)*$/.test(widthAttr)
    ? widthAttr.split(',').map(Number)
    : null
  const colspan = Number(dom.getAttribute('colspan') || 1)

  return {
    colspan,
    rowspan: Number(dom.getAttribute('rowspan') || 1),
    colwidth: widths && widths.length === colspan ? widths : null,
    alignment: dom.style.textAlign || null,
  }
}

function tableCellDomAttrs(node: ProseNode) {
  const attrs: Record<string, string | number> = {}
  if (node.attrs.colspan !== 1) attrs.colspan = node.attrs.colspan as number
  if (node.attrs.rowspan !== 1) attrs.rowspan = node.attrs.rowspan as number
  if (node.attrs.colwidth) attrs['data-colwidth'] = (node.attrs.colwidth as number[]).join(',')
  if (node.attrs.alignment) attrs.style = `text-align: ${node.attrs.alignment as string}`
  return attrs
}

function withOptionalAlignment(tag: 'td' | 'th') {
  return (base: (ctx: Ctx) => NodeSchema) => (ctx: Ctx): NodeSchema => {
    const schema = base(ctx)
    return {
      ...schema,
      attrs: {
        ...schema.attrs,
        alignment: { default: null },
      },
      parseDOM: [{
        tag,
        getAttrs: (dom: Node | string) => dom instanceof HTMLElement ? readTableCellAttrs(dom) : false,
      }],
      toDOM: (node: ProseNode) => [tag, tableCellDomAttrs(node), 0],
    }
  }
}

const miloTableCellAlignment = tableCellSchema.extendSchema(withOptionalAlignment('td'))
const miloTableHeaderAlignment = tableHeaderSchema.extendSchema(withOptionalAlignment('th'))

export const miloTableAlignmentSchema = [miloTableCellAlignment, miloTableHeaderAlignment].flat()

export { miloTableCellAlignment, miloTableHeaderAlignment }

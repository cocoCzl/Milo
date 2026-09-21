import { defaultValueCtx, Editor, editorViewCtx, parserCtx, rootCtx, schemaCtx, serializerCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import type { Node as ProseNode, Schema } from '@milkdown/prose/model'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { composeMarkdownDocument, inspectMarkdownDocument } from '../markdown/documentSafety'
import { miloEmptyTableCellSerializer } from './tableEmptyCellSerializer'
import { miloTableAlignmentSchema } from './tableAlignment'

const createdEditors: Array<{ editor: Editor; mount: HTMLElement }> = []

afterEach(async () => {
  await Promise.all(createdEditors.splice(0).map(async ({ editor, mount }) => {
    await editor.destroy()
    mount.remove()
  }))
})

async function createTablePipeline() {
  const mount = document.body.appendChild(document.createElement('div'))
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, mount)
      ctx.set(defaultValueCtx, '')
    })
    .use(commonmark)
    .use(gfm)
    .use(miloTableAlignmentSchema)
    .use(miloEmptyTableCellSerializer)
  await editor.create()
  createdEditors.push({ editor, mount })
  return editor
}

function tableDocument(schema: Schema, rows: Array<Array<ProseNode[]>>) {
  const paragraph = schema.nodes.paragraph
  const header = schema.nodes.table_header
  const cell = schema.nodes.table_cell
  const headerRow = schema.nodes.table_header_row
  const tableRow = schema.nodes.table_row
  const table = schema.nodes.table
  if (!paragraph || !header || !cell || !headerRow || !tableRow || !table) throw new Error('GFM table schema unavailable')

  const makeCell = (type: typeof header, content: ProseNode[]) => type.create(null, paragraph.create(null, content))
  const makeRow = (contents: ProseNode[][], index: number) => (
    index === 0
      ? headerRow.create(null, contents.map((content) => makeCell(header, content)))
      : tableRow.create(null, contents.map((content) => makeCell(cell, content)))
  )
  return schema.topNodeType.create(null, [table.create(null, rows.map(makeRow))])
}

function tableShape(doc: ProseNode) {
  const table = doc.firstChild
  if (!table) throw new Error('Expected table document')
  return {
    rows: table.childCount,
    columns: Array.from({ length: table.childCount }, (_, index) => table.child(index).childCount),
    emptyCells: Array.from({ length: table.childCount }, (_, rowIndex) => (
      Array.from({ length: table.child(rowIndex).childCount }, (_, cellIndex) => (
        table.child(rowIndex).child(cellIndex).firstChild?.content.size === 0
      ))
    )),
  }
}

function assertSafeTableMarkdown(markdown: string) {
  expect(markdown).not.toContain('<br')
  expect(markdown).not.toMatch(/[\u00a0\u200b-\u200d\ufeff]/i)
  expect(markdown).not.toMatch(/^\\$/m)
}

describe('Milo empty table-cell serialization', () => {
  it('keeps omitted and explicit GFM column alignments distinct', async () => {
    const cases = [
      ['| A |\n| --- |\n| B |\n', null, '', /^\|\s*-\s*\|/m],
      ['| A |\n| :--- |\n| B |\n', 'left', 'left', /^\|\s*:-+\s*\|/m],
      ['| A |\n| :---: |\n| B |\n', 'center', 'center', /^\|\s*:-+:\s*\|/m],
      ['| A |\n| ---: |\n| B |\n', 'right', 'right', /^\|\s*-+:\s*\|/m],
    ] as const

    for (const [markdown, alignment, domAlignment, marker] of cases) {
      const mount = document.body.appendChild(document.createElement('div'))
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, mount)
          ctx.set(defaultValueCtx, markdown)
        })
        .use(commonmark)
        .use(gfm)
        .use(miloTableAlignmentSchema)
        .use(miloEmptyTableCellSerializer)
      await editor.create()
      createdEditors.push({ editor, mount })

      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        expect(view.state.doc.firstChild?.firstChild?.firstChild?.attrs.alignment).toBe(alignment)
        expect(ctx.get(serializerCtx)(view.state.doc)).toMatch(marker)
      })
      expect(mount.querySelector('th')?.style.textAlign).toBe(domAlignment)
      expect(mount.querySelector('td')?.style.textAlign).toBe(domAlignment)
    }
  })

  it('creates new table cells with omitted alignment instead of explicit left alignment', async () => {
    const editor = await createTablePipeline()
    editor.action((ctx) => {
      const schema = ctx.get(schemaCtx)
      const original = tableDocument(schema, Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => [])))
      original.descendants((node) => {
        if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
          expect(node.attrs.alignment).toBeNull()
        }
      })
      expect(ctx.get(serializerCtx)(original)).toMatch(/^\|\s*\|\s*\|\s*\|\n\|\s*-\s*\|\s*-\s*\|\s*-\s*\|/)
    })
  })

  it('round-trips an editor-generated empty 3×3 table through a real temp file without HTML or invisible text', async () => {
    const editor = await createTablePipeline()
    let markdown = ''
    let reparsed: ProseNode | null = null
    let original: ProseNode | null = null

    editor.action((ctx) => {
      const schema = ctx.get(schemaCtx)
      original = tableDocument(schema, Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => [])))
      const serialize = ctx.get(serializerCtx)
      markdown = serialize(original)
      reparsed = ctx.get(parserCtx)(markdown)
    })

    assertSafeTableMarkdown(markdown)
    expect(tableShape(reparsed!)).toEqual(tableShape(original!))

    const directory = mkdtempSync(join(tmpdir(), 'milo-empty-table-'))
    const file = join(directory, 'TABLE_TEST.md')
    try {
      writeFileSync(file, markdown, 'utf8')
      const bytes = readFileSync(file)
      expect(bytes.equals(Buffer.from(markdown, 'utf8'))).toBe(true)

      let reopened = ''
      editor.action((ctx) => {
        const parsed = ctx.get(parserCtx)(bytes.toString('utf8'))
        reopened = ctx.get(serializerCtx)(parsed)
        expect(tableShape(parsed)).toEqual(tableShape(original!))
      })
      expect(reopened).toBe(markdown)
      assertSafeTableMarkdown(reopened)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('retains populated cells and every supported inline mark while preserving only structurally empty cells', async () => {
    const editor = await createTablePipeline()
    let markdown = ''
    let reparsed: ProseNode | null = null
    let original: ProseNode | null = null

    editor.action((ctx) => {
      const schema = ctx.get(schemaCtx)
      const text = (value: string, marks: ReturnType<NonNullable<typeof schema.marks.strong>['create']>[] = []) => schema.text(value, marks)
      const strong = schema.marks.strong!.create()
      const emphasis = schema.marks.emphasis!.create()
      const inlineCode = schema.marks.inlineCode!.create()
      const link = schema.marks.link!.create({ href: 'https://example.com/', title: null })
      original = tableDocument(schema, [
        [[], [text('中文')], [text('粗体', [strong])]],
        [[text('italic', [emphasis])], [text('code', [inlineCode])], [text('link', [link])]],
        [[text('plain')], [], [text('混合', [strong, emphasis])]],
      ])
      markdown = ctx.get(serializerCtx)(original)
      reparsed = ctx.get(parserCtx)(markdown)
    })

    assertSafeTableMarkdown(markdown)
    expect(markdown).toContain('中文')
    expect(markdown).toContain('**粗体**')
    expect(markdown).toContain('*italic*')
    expect(markdown).toContain('`code`')
    expect(markdown).toContain('[link](https://example.com/)')
    expect(tableShape(reparsed!)).toEqual(tableShape(original!))
  })

  it('does not rewrite user-authored raw HTML: the document boundary protects its original bytes before WYSIWYG parsing', () => {
    const rawHtml = '第一行<br />第二行\n\n<br />\n'
    const inspected = inspectMarkdownDocument(rawHtml)

    expect(inspected.protectionReason).toMatch(/raw HTML/)
    expect(composeMarkdownDocument(inspected.frontMatter, inspected.body)).toBe(rawHtml)
  })

  it('does not discard an authored HTML node inside a non-empty table cell', async () => {
    const editor = await createTablePipeline()
    let markdown = ''

    editor.action((ctx) => {
      const schema = ctx.get(schemaCtx)
      const html = schema.nodes.html
      if (!html) throw new Error('HTML node schema unavailable')
      const doc = tableDocument(schema, [
        [[html.create({ value: '<br />' })], [], []],
        [[], [], []],
        [[], [], []],
      ])
      markdown = ctx.get(serializerCtx)(doc)
    })

    // This exact raw HTML is preserved by the table-cell serializer. Milo's
    // document boundary will protect such a document rather than feed it back
    // into WYSIWYG parsing, so no raw HTML bytes are silently changed.
    expect(markdown).toContain('<br />')
    expect(inspectMarkdownDocument(markdown).protectionReason).toMatch(/raw HTML/)
  })
})

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { splitFrontMatter } from './documentBoundary'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { composeMarkdownDocument, inspectMarkdownDocument } from './documentSafety'

const frontMatterFixture = readFileSync(
  resolve('src/editor/markdown/__fixtures__/front-matter.md'),
  'utf8',
)
const protectedFixture = readFileSync(
  resolve('src/editor/markdown/__fixtures__/protected-html.md'),
  'utf8',
)
const supportedFixture = readFileSync(resolve('src/editor/markdown/__fixtures__/gfm.md'), 'utf8')

describe('inspectMarkdownDocument', () => {
  it('separates Front Matter without changing any of its bytes', () => {
    const document = inspectMarkdownDocument(frontMatterFixture)

    expect(document.frontMatter).toBe('---\nlayout: post\ntags: [milo, markdown]\n---\n')
    expect(document.body).toBe('\n# A quiet page\n')
    expect(composeMarkdownDocument(document.frontMatter, document.body)).toBe(frontMatterFixture)
    expect(document.protectionReason).toBeNull()
  })

  it('retains CRLF Front Matter bytes when the edited body is recomposed', () => {
    const source = '---\r\ntitle: Milo\r\n---\r\n\r\n# Before\r\n'
    const document = inspectMarkdownDocument(source)

    expect(document.frontMatter).toBe('---\r\ntitle: Milo\r\n---\r\n')
    expect(composeMarkdownDocument(document.frontMatter, '# After\r\n')).toBe(
      '---\r\ntitle: Milo\r\n---\r\n# After\r\n',
    )
  })

  it('keeps the agreed CommonMark and GFM subset editable', () => {
    expect(inspectMarkdownDocument(supportedFixture).protectionReason).toBeNull()
  })

  it('protects raw HTML instead of passing it through the WYSIWYG serializer', () => {
    expect(inspectMarkdownDocument(protectedFixture).protectionReason).toMatch(/raw HTML/)
  })
})

it('matches the original full-AST protection for HTML and Markdown boundaries', () => {
  const parser = unified().use(remarkParse).use(remarkGfm)
  const containsHtml = (node: { type: string; children?: (typeof node)[] }): boolean =>
    node.type === 'html' || (node.children?.some(containsHtml) ?? false)
  const examples = [
    '',
    '# 中文 plain',
    '<div>块</div>',
    '行内 <b>中文</b>',
    '<!-- comment -->',
    '<!DOCTYPE html>',
    '<https://example.com>',
    '<test@example.com>',
    '| A | B |\n| - | - |\n| a | b |',
    '```html\n<div>code</div>\n```',
    '`<b>code</b>`',
    '\\<b>escaped',
    '&lt;div&gt;',
    '＜div＞全角',
    '---\ntitle: "<b>front matter</b>"\n---\n\n正文',
    '---\r\ntitle: x\r\n---\r\n\r\n# 中文',
    '---\ntitle: unclosed\n正文',
    '---',
    'a < b',
    '正文\n\n'.repeat(20000) + '<div>真正 HTML 在末尾</div>',
    frontMatterFixture,
    protectedFixture,
    supportedFixture,
  ]
  for (const markdown of examples) {
    const { frontMatter, body } = splitFrontMatter(markdown)
    const protectionReason = containsHtml(parser.parse(body))
      ? 'This document contains raw HTML, which Milo cannot safely preserve in WYSIWYG mode.'
      : null
    expect(inspectMarkdownDocument(markdown)).toEqual({ frontMatter, body, protectionReason })
  }
})

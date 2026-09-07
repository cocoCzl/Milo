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
const supportedFixture = readFileSync(
  resolve('src/editor/markdown/__fixtures__/gfm.md'),
  'utf8',
)

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

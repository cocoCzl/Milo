import { describe, expect, it } from 'vitest'
import { isSupportedLink, resolveDocumentLink } from './documentLink'
describe('document link boundary', () => {
  it.each([
    ['./guide.md', '/notes/中文目录/guide.md', ''],
    ['../README.md', '/notes/README.md', ''],
    ['./中文%20文件.md#%E6%A0%87%E9%A2%98', '/notes/中文目录/中文 文件.md', '标题'],
    ['./a%23b.md#part', '/notes/中文目录/a#b.md', 'part'],
    ['#标题', '/notes/中文目录/start.md', '标题'],
    ['./guide.markdown#one', '/notes/中文目录/guide.markdown', 'one'],
  ])(
    'resolves %s without treating encoded filename characters as navigation',
    (href, path, anchor) => {
      expect(resolveDocumentLink(href, '/notes/中文目录/start.md')).toEqual({
        kind: 'document',
        path,
        anchor,
      })
    },
  )
  it('handles unnamed page anchors and external links separately', () => {
    expect(resolveDocumentLink('#part', null)).toEqual({
      kind: 'document',
      path: null,
      anchor: 'part',
    })
    expect(resolveDocumentLink('https://example.test/page', null)).toEqual({
      kind: 'external',
      url: 'https://example.test/page',
    })
  })
  it.each([
    'javascript:alert(1)',
    '//example.test/doc.md',
    'file:///etc/a.md',
    './image.png',
    './bad%00.md',
    './bad%.md',
    './doc.md?query',
  ])('rejects unsafe or unsupported %s', (href) => {
    expect(isSupportedLink(href)).toBe(false)
  })
})

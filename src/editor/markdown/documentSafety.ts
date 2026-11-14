import { unified } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'

type MarkdownNode = {
  type: string
  children?: MarkdownNode[]
}

export type MarkdownDocumentBoundary = {
  frontMatter: string
  body: string
  protectionReason: string | null
}

import { splitFrontMatter } from './documentBoundary'
export { composeMarkdownDocument, splitFrontMatter } from './documentBoundary'

const markdownParser = unified().use(remarkParse).use(remarkGfm)
export function inspectMarkdownDocument(markdown: string): MarkdownDocumentBoundary {
  const { frontMatter, body } = splitFrontMatter(markdown)
  const protectionReason = findProtectionReason(body)

  return { frontMatter, body, protectionReason }
}

function findProtectionReason(markdown: string): string | null {
  const tree = markdownParser.parse(markdown) as MarkdownNode

  return containsHtml(tree)
    ? 'This document contains raw HTML, which Milo cannot safely preserve in WYSIWYG mode.'
    : null
}

function containsHtml(node: MarkdownNode): boolean {
  if (node.type === 'html') {
    return true
  }

  return node.children?.some(containsHtml) ?? false
}

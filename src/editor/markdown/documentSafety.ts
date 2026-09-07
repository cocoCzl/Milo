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

const markdownParser = unified().use(remarkParse).use(remarkGfm)
const frontMatterOpening = /^---[\t ]*(?:\r?\n|$)/
const frontMatterClosing = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/gm

export function inspectMarkdownDocument(markdown: string): MarkdownDocumentBoundary {
  const { frontMatter, body } = splitFrontMatter(markdown)
  const protectionReason = findProtectionReason(body)

  return { frontMatter, body, protectionReason }
}

export function composeMarkdownDocument(frontMatter: string, body: string): string {
  return `${frontMatter}${body}`
}

function splitFrontMatter(markdown: string): Pick<MarkdownDocumentBoundary, 'frontMatter' | 'body'> {
  const opening = frontMatterOpening.exec(markdown)

  if (!opening) {
    return { frontMatter: '', body: markdown }
  }

  frontMatterClosing.lastIndex = opening[0].length
  const closing = frontMatterClosing.exec(markdown)

  if (!closing) {
    return { frontMatter: '', body: markdown }
  }

  const boundary = closing.index + closing[0].length

  return {
    frontMatter: markdown.slice(0, boundary),
    body: markdown.slice(boundary),
  }
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

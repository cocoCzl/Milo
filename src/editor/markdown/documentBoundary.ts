import type { MarkdownDocumentBoundary } from './documentSafety'

const frontMatterOpening = /^---[\t ]*(?:\r?\n|$)/
const frontMatterClosing = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/gm

export function composeMarkdownDocument(frontMatter: string, body: string): string {
  return `${frontMatter}${body}`
}

export function splitFrontMatter(
  markdown: string,
): Pick<MarkdownDocumentBoundary, 'frontMatter' | 'body'> {
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

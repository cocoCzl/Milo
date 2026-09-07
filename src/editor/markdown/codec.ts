import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'

const markdownProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify).use(remarkGfm)

export function normalizeMarkdown(markdown: string): string {
  return String(markdownProcessor.processSync(markdown))
}

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'

const markdownProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify)

export function normalizeMarkdown(markdown: string): string {
  return String(markdownProcessor.processSync(markdown))
}

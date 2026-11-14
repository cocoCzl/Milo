// Synthetic, deterministic workloads shared by native and browser profiling.
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { createHash } from 'node:crypto'
const parser = unified().use(remarkParse).use(remarkGfm)
const fill = (unit, bytes) => unit.repeat(Math.ceil(bytes / Buffer.byteLength(unit)))
const paragraph = '中文写作与 English text，标点 punctuation。'.repeat(40) + '\n\n'
export const samples = {
  'small-mixed':
    '# 写作 Writing\n\n中文与 English 混排。\n\n- 一个条目\n- Another item\n\n> 引用 Quote\n',
  'plain-100kb': fill(paragraph, 100_000),
  'plain-1mb': fill(paragraph, 1_000_000),
  headings: Array.from(
    { length: 1000 },
    (_, i) => `## ${i + 1}. 章节 Heading\n\n简短正文。\n`,
  ).join('\n'),
  code: Array.from({ length: 300 }, (_, i) => `\`\`\`ts\nconst value${i} = ${i}\n\`\`\``).join(
    '\n\n',
  ),
  tables: Array.from(
    { length: 300 },
    (_, i) => `| 名称 Name | 值 Value |\n| --- | --- |\n| ${i} | 中文 |\n| English | text |`,
  ).join('\n\n'),
  images:
    '# 本地图片 Local images\n\n' +
    Array.from({ length: 80 }, (_, i) => `![合成图片 ${i}](assets/image-${i}.png)`).join('\n\n'),
  'structured-1mb': fill(
    '# Document\n\n' +
      paragraph +
      '\n```ts\nconst value = 1\n```\n\n| A | B |\n| - | - |\n| x | |\n\n',
    1_000_000,
  ),
}
export function describeSample(name, markdown) {
  const counts = { nodes: 0, heading: 0, code: 0, table: 0, image: 0, paragraph: 0 }
  const visit = (node) => {
    counts.nodes++
    if (node.type in counts) counts[node.type]++
    for (const child of node.children || []) visit(child)
  }
  visit(parser.parse(markdown))
  return {
    name,
    bytes: Buffer.byteLength(markdown),
    sha256: createHash('sha256').update(markdown).digest('hex'),
    counts,
    bom: false,
    lineEnding: 'LF',
  }
}

// Fixed disposable inputs; never changes fixtures to improve measured results.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
const output = resolve(process.argv[2] || '/private/tmp/milo-native-review')
await mkdir(`${output}/tabs`, { recursive: true })
const unit =
  '# Document\n\n' +
  '中文 English paragraph sentence. '.repeat(80) +
  '\n\n**strong** and [link](https://example.com).\n\n```ts\nconst value = 1\n```\n\n| A | B |\n| - | - |\n| x | |\n\n'
const plainUnit = 'Plain text paragraph 中文写作内容。 '.repeat(80) + '\n\n'
const sources = {
  'plain-1mb.md': plainUnit.repeat(Math.ceil(1_000_000 / Buffer.byteLength(plainUnit))),
  'structured-1mb.md': unit.repeat(Math.ceil(1_000_000 / Buffer.byteLength(unit))),
  'ordinary.md': await readFile(
    new URL('../tests/fixtures/outline-long.md', import.meta.url),
    'utf8',
  ),
}
const manifest = { generatedBy: 'scripts/create-native-profile-fixtures.mjs', files: [] }
for (const [name, markdown] of Object.entries(sources)) {
  const counts = { heading: 0, code: 0, table: 0, image: 0, paragraph: 0 }
  const visit = (node) => {
    if (node.type in counts) counts[node.type]++
    for (const child of node.children || []) visit(child)
  }
  visit(unified().use(remarkParse).use(remarkGfm).parse(markdown))
  await writeFile(`${output}/${name}`, markdown)
  manifest.files.push({
    name,
    bytes: Buffer.byteLength(markdown),
    sha256: createHash('sha256').update(markdown).digest('hex'),
    counts,
    bom: false,
    lineEnding: 'LF',
  })
}
for (let i = 1; i <= 10; i++)
  await writeFile(`${output}/tabs/${String(i).padStart(2, '0')}.md`, sources['ordinary.md'])
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest, null, 2))

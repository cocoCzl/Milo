import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeMarkdown } from './codec'

const coreFixture = readFileSync(
  resolve('src/editor/markdown/__fixtures__/core.md'),
  'utf8',
)
const gfmFixture = readFileSync(
  resolve('src/editor/markdown/__fixtures__/gfm.md'),
  'utf8',
)

describe('normalizeMarkdown', () => {
  it('round-trips the supported core Markdown semantics', () => {
    const normalized = normalizeMarkdown(coreFixture)

    expect(normalized).toContain('# A quiet page')
    expect(normalized).toContain('**bold**')
    expect(normalized).toContain('*emphasis*')
    expect(normalized).toContain('`code`')
    expect(normalized).toContain('> A considered quote.')
    expect(normalized).toContain('1. First thought')
    expect(normalized).toContain('* A simple point')
    expect(normalized).toContain('***')
    expect(normalized).toContain('[Visit Milo](https://example.com/milo)')
  })

  it('round-trips task lists and tables as GFM', () => {
    const normalized = normalizeMarkdown(gfmFixture)

    expect(normalized).toContain('* [ ] Shape the draft')
    expect(normalized).toContain('* [x] Review the outline')
    expect(normalized).toContain('| Area')
    expect(normalized).toContain('| Editor')
    expect(normalized).toContain('```typescript')
    expect(normalized).toContain("const product = 'Milo'")
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import './global.css'

const globalCss = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8')

afterEach(() => {
  document.body.replaceChildren()
})

describe('editor typography baseline', () => {
  it('defines the Variant C body typography without changing the accepted rhythm', () => {
    expect(globalCss).toContain('--editor-font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;')
    expect(globalCss).toContain('--editor-font-size: 16.5px;')
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror \{[^}]*font-family: var\(--editor-font-family\);[^}]*font-size: var\(--editor-font-size\);[^}]*line-height: 1\.7;[^}]*letter-spacing: 0;/s)
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror > p:has\(\+ p\) \{\s*margin-bottom: 0\.75em;\s*\}/)
  })

  it('authors every heading level instead of falling back to WebKit defaults', () => {
    expect(globalCss).toContain('--editor-heading-line-height: 1.22;')
    expect(globalCss).toContain('--editor-heading-space-before: var(--editor-font-size);')

    const expectedHeadings = [
      ['h1', '1.9091', '700', '0.9545'],
      ['h2', '1.5152', '680', '0.7576'],
      ['h3', '1.2424', '660', '0.6212'],
      ['h4', '1.0909', '640', '0.5455'],
      ['h5', '1.0303', '620', '0.5152'],
    ]

    expectedHeadings.forEach(([tag, sizeRatio, weight, spaceAfterRatio]) => {
      expect(globalCss).toMatch(new RegExp(`\\.milkdown \\.ProseMirror ${tag} \\{[^}]*font-size: calc\\(var\\(--editor-font-size\\) \\* ${sizeRatio}\\);[^}]*font-weight: ${weight};[^}]*margin-bottom: calc\\(var\\(--editor-font-size\\) \\* ${spaceAfterRatio}\\);`, 's'))
    })
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror h6 \{[^}]*font-size: var\(--editor-font-size\);[^}]*font-weight: 600;[^}]*margin-bottom: calc\(var\(--editor-font-size\) \* 0\.5\);/s)
  })
})

describe('editor table typography', () => {
  it('removes paragraph rhythm only inside table cells while keeping cells vertically centered', () => {
    document.body.innerHTML = `
      <div class="milkdown">
        <div class="ProseMirror">
          <p id="body-paragraph">Body</p>
          <table>
            <thead><tr><th><p id="header-paragraph">Header</p></th></tr></thead>
            <tbody><tr><td><p id="cell-paragraph">Cell</p></td></tr></tbody>
          </table>
        </div>
      </div>
    `

    const header = document.querySelector<HTMLElement>('th')!
    const cell = document.querySelector<HTMLElement>('td')!
    const headerParagraph = document.querySelector<HTMLElement>('#header-paragraph')!
    const cellParagraph = document.querySelector<HTMLElement>('#cell-paragraph')!
    const bodyParagraph = document.querySelector<HTMLElement>('#body-paragraph')!

    expect(getComputedStyle(header).verticalAlign).toBe('middle')
    expect(getComputedStyle(cell).verticalAlign).toBe('middle')
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror th > p,\s*\.milkdown \.ProseMirror td > p \{\s*margin-block: 0;\s*\}/)
    expect(headerParagraph.parentElement).toBe(header)
    expect(cellParagraph.parentElement).toBe(cell)
    expect(getComputedStyle(bodyParagraph).marginBottom).not.toBe('0px')
  })
})

describe('editor list and quote typography', () => {
  it('keeps list and task paragraphs from inheriting body paragraph spacing', () => {
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror li > p \{\s*margin-block: 0;\s*\}/)
    expect(globalCss).not.toMatch(/li\[data-item-type="task"\] > p \{/)
  })

  it('gives blockquotes an independent paragraph rhythm with no trailing gap', () => {
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror blockquote > p \{\s*margin-block: 0 0\.65em;\s*\}/)
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror blockquote > p:last-child \{\s*margin-bottom: 0;\s*\}/)
  })

  it('preserves body and table-cell paragraph spacing boundaries', () => {
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror p \{[^}]*margin: 0 0 1\.12em;/s)
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror th > p,\s*\.milkdown \.ProseMirror td > p \{\s*margin-block: 0;\s*\}/)
  })
})

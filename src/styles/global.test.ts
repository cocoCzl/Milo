import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import './global.css'

const globalCss = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8')

afterEach(() => {
  document.body.replaceChildren()
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

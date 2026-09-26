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

describe('application shell foundation', () => {
  it('separates application, context, and editor surfaces with the compact navigation range', () => {
    expect(globalCss).toContain('--application-bar-height: 48px;')
    expect(globalCss).toContain('--document-context-height: 40px;')
    expect(globalCss).toMatch(/\.document-area \{[^}]*grid-template-rows: var\(--document-context-height\) minmax\(0, 1fr\);/s)
    expect(globalCss).toMatch(/\.document-stage \{[^}]*overflow: auto;[^}]*background: var\(--surface-editor\);/s)
    expect(globalCss).toMatch(/\.file-sidebar \{[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto;[^}]*min-width: 208px;[^}]*max-width: 320px;[^}]*overflow: hidden;/s)
    expect(globalCss).toMatch(/\.file-sidebar__body \{[^}]*overflow: auto;/s)
    expect(globalCss).toMatch(/\.file-sidebar__footer \{[^}]*border-top:/s)
    expect(globalCss).toMatch(/\.file-sidebar__resize-handle:focus-visible::after \{[^}]*background: var\(--focus-ring\);/s)
  })

  it('keeps the macOS drag region and makes every application action group interactive', () => {
    expect(globalCss).toMatch(/\.window-bar \{[^}]*-webkit-app-region: drag;/s)
    expect(globalCss).toMatch(/\.window-bar__actions \{[^}]*-webkit-app-region: no-drag;/s)
    expect(globalCss).toMatch(/\.document-tab \{[^}]*-webkit-app-region: no-drag;/s)
    expect(globalCss).toMatch(/\.application-bar__tabs > \.icon-button-shell \{[^}]*-webkit-app-region: no-drag;/s)
  })

  it('keeps tabs usable while progressively removing unavailable layout controls', () => {
    expect(globalCss).toMatch(/\.application-bar__tabs \{[^}]*flex: 1 1 auto;[^}]*min-width: 0;[^}]*overflow: hidden;/s)
    expect(globalCss).toMatch(/\.tab-strip \{[^}]*flex: 1 1 auto;[^}]*min-width: 0;[^}]*overflow-x: auto;/s)
    expect(globalCss).toMatch(/@media \(max-width: 900px\) \{[^}]*\.application-bar__sidebar-toggle \{\s*display: none;/s)
    expect(globalCss).toMatch(/@media \(max-width: 720px\) \{[^}]*\.application-bar__focus-toggle \{\s*display: none;/s)
  })

  it('defines theme-specific semantic shell surfaces', () => {
    for (const token of ['surface-shell', 'surface-toolbar', 'surface-context', 'surface-editor', 'surface-outline']) {
      expect(globalCss).toContain(`--${token}:`)
    }
    expect(globalCss).toMatch(/\.app-shell\[data-theme="dark"\] \{[^}]*--surface-context:/s)
    expect(globalCss).toMatch(/\.app-shell\[data-theme="warm"\] \{[^}]*--surface-context:/s)
  })

  it('keeps the focus outline entry viewport-fixed while allowing only the drawer outline', () => {
    expect(globalCss).toMatch(/\.focus-mode-outline-trigger \{[^}]*position: fixed;[^}]*background: var\(--surface-raised\);[^}]*border: 1px solid var\(--line\);/s)
    expect(globalCss).toMatch(/\.app-shell--focus-mode \.editor-outline:not\(\.editor-outline--drawer\) \{\s*display: none;\s*\}/)
    expect(globalCss).not.toMatch(/\.app-shell--focus-mode \.editor-outline \{\s*display: none;/)
    expect(globalCss).toMatch(/\.document-area \{[^}]*position: relative;/s)
    expect(globalCss).toMatch(/\.outline-drawer-layer \{[^}]*position: absolute;[^}]*inset: 0;/s)
    expect(globalCss).toMatch(/\.outline-drawer-layer \.outline-backdrop,\s*\.outline-drawer-layer \.editor-outline--drawer \{[^}]*position: absolute;/s)
    expect(globalCss).not.toMatch(/\.editor-outline--drawer \{[^}]*transform:/s)
    expect(globalCss).toMatch(/\.app-shell--focus-mode \.editor-outline--drawer \{[^}]*top: 0;/s)
    expect(globalCss).toMatch(/\.app-shell--focus-mode \.outline-backdrop \{[^}]*inset: 0;/s)
  })
})

describe('editor table typography', () => {
  it('contains intrinsic table width in the standard TableView wrapper', () => {
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror \.tableWrapper \{[^}]*width: 100%;[^}]*max-width: 100%;[^}]*min-width: 0;[^}]*overflow-x: auto;/s)
    expect(globalCss).not.toMatch(/\.document-stage \{[^}]*overflow-x: hidden;/s)
    expect(globalCss).not.toMatch(/\.milkdown \.ProseMirror table \{[^}]*display: block;/s)
  })

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

describe('editor image integrity states', () => {
  it('keeps local image failure chrome contained and theme-token based', () => {
    expect(globalCss).toMatch(/\.local-image-view \{\s*display: block;\s*max-width: 100%;\s*\}/)
    expect(globalCss).toMatch(/\.remote-image-view \{\s*display: block;\s*max-width: 100%;\s*\}/)
    expect(globalCss).toMatch(/\.local-image-placeholder \{[^}]*display: inline-flex;[^}]*max-width: 100%;[^}]*color: var\(--muted-ink\);[^}]*background: var\(--soft-fill\);[^}]*border: 1px solid var\(--line\);/s)
    expect(globalCss).toMatch(/\.local-image-placeholder__status \{[^}]*color: var\(--subtle-ink\);/s)
    expect(globalCss).not.toMatch(/\.local-image-placeholder[^}]*position:\s*(?:fixed|absolute)/s)
  })

  it('rings the rendered image or placeholder only in edit mode', () => {
    expect(globalCss).toMatch(/\.milkdown-editor:not\(\.milkdown-editor--read\) \.ProseMirror \.local-image-view\.ProseMirror-selectednode,\s*\.milkdown-editor:not\(\.milkdown-editor--read\) \.ProseMirror \.remote-image-view\.ProseMirror-selectednode \{\s*outline: none;\s*\}/)
    expect(globalCss).toMatch(/\.milkdown-editor:not\(\.milkdown-editor--read\)[^{]+\.local-image-view\.ProseMirror-selectednode > img,[^{]+\.remote-image-view\.ProseMirror-selectednode > img,[^{]+\.local-image-view\.ProseMirror-selectednode > \.local-image-placeholder \{[^}]*outline: 2px solid var\(--accent\);[^}]*outline-offset: 3px;/s)
    expect(globalCss).toMatch(/\.milkdown-editor--read \.ProseMirror \.local-image-view\.ProseMirror-selectednode,\s*\.milkdown-editor--read \.ProseMirror \.remote-image-view\.ProseMirror-selectednode \{\s*outline: none;\s*\}/)
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror \.local-image-view\[contenteditable="false"\],[^{]+\.remote-image-view\[contenteditable="false"\] \{\s*-webkit-user-select: none;\s*user-select: none;/s)
    expect(globalCss).toMatch(/\.milkdown \.ProseMirror \.local-image-view::selection,[^{]+\.remote-image-view \*::selection \{\s*background: transparent;/s)
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

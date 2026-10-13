import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, list, type Rule } from 'postcss'
import { afterEach, describe, expect, it } from 'vitest'

import './global.css'

const stylesheet = parse(readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8'))

// Ignore presentation whitespace while preserving selector membership, values,
// !important and media scope. Do not use jsdom layout as a WebKit substitute.
function normalized(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').replace(/(?<![\w-])\.(\d)/g, '0.$1').trim()
}

function rulesFor(selector: string, media?: string): Rule[] {
  const rules: Rule[] = []
  stylesheet.walkRules((rule) => {
    const parent = rule.parent
    const scope = parent?.type === 'atrule' && parent.name === 'media' ? parent.params : undefined
    if (scope === media && list.comma(rule.selector).map(normalized).includes(normalized(selector))) rules.push(rule)
  })
  return rules
}

function declarations(selector: string, expected: Record<string, string>, media?: string) {
  const rules = rulesFor(selector, media)
  expect(rules.length, `${selector} in ${media ?? 'root'}`).toBeGreaterThan(0)
  const actual: Record<string, string> = {}
  for (const rule of rules) {
    rule.walkDecls((declaration) => {
      actual[declaration.prop] = normalized(declaration.value) + (declaration.important ? ' !important' : '')
    })
  }
  for (const [property, value] of Object.entries(expected)) {
    expect(actual[property], `${selector}: ${property}`).toBe(normalized(value))
  }
}

function absentDeclaration(selector: string, property: string, value?: string) {
  for (const rule of rulesFor(selector)) {
    rule.walkDecls(property, (declaration) => {
      if (value === undefined) expect.fail(`${selector} must not declare ${property}`)
      else expect(normalized(declaration.value)).not.toBe(normalized(value))
    })
  }
}

afterEach(() => { document.body.replaceChildren() })

describe('editor typography baseline', () => {
  it('defines the Variant C body typography without changing the accepted rhythm', () => {
    declarations('.app-shell', {
      '--editor-sans-font-family': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
      '--editor-serif-font-family': 'ui-serif, "Songti SC", STSong, "Noto Serif CJK SC", "Source Han Serif SC", SimSun, Georgia, serif',
      '--editor-body-font-family': 'var(--editor-sans-font-family)',
      '--editor-heading-font-family': 'var(--editor-sans-font-family)',
      '--editor-font-size': '16.5px', '--editor-line-height': '1.7',
    })
    declarations('.milkdown .ProseMirror', {
      'font-family': 'var(--editor-body-font-family)', 'font-size': 'var(--editor-font-size)',
      'line-height': 'var(--editor-line-height)', 'letter-spacing': '0',
    })
    declarations('.milkdown .ProseMirror > p:has(+ p)', { 'margin-bottom': '0.75em' })
  })

  it('maps semantic reading preferences while keeping structured content typography stable', () => {
    declarations('.app-shell[data-document-font-style="serif"]', { '--editor-body-font-family': 'var(--editor-serif-font-family)' })
    declarations('.app-shell', { '--reading-width': '860px' })
    for (const [width, value] of [['narrow', '720px'], ['wide', '960px']]) {
      declarations(`.app-shell[data-reading-width="${width}"]`, { '--reading-width': value })
    }
    for (const [height, value] of [['compact', '1.58'], ['relaxed', '1.82']]) {
      declarations(`.app-shell[data-line-height="${height}"]`, { '--editor-line-height': value })
    }
    for (let level = 1; level <= 6; level += 1) {
      declarations(`.milkdown .ProseMirror h${level}`, { 'font-family': 'var(--editor-heading-font-family)', 'line-height': 'var(--editor-heading-line-height)' })
    }
    declarations('.milkdown .ProseMirror table', { 'font-family': 'var(--editor-heading-font-family)', 'font-size': 'inherit', 'line-height': '1.5' })
    declarations('.milkdown .ProseMirror code', { 'font-family': 'ui-monospace, "SF Mono", "Cascadia Code", monospace' })
    declarations('.milkdown .ProseMirror .code-block-card__content', { 'font-family': 'ui-monospace, "SF Mono", "Cascadia Code", monospace', 'font-size': '0.77em', 'line-height': '1.62' })
  })

  it('authors every heading level instead of falling back to WebKit defaults', () => {
    declarations('.app-shell', { '--editor-heading-line-height': '1.22', '--editor-heading-space-before': 'var(--editor-font-size)' })
    for (const [tag, size, weight, after] of [
      ['h1', '1.9091', '700', '0.9545'], ['h2', '1.5152', '680', '0.7576'],
      ['h3', '1.2424', '660', '0.6212'], ['h4', '1.0909', '640', '0.5455'], ['h5', '1.0303', '620', '0.5152'],
    ]) {
      declarations(`.milkdown .ProseMirror ${tag}`, { 'font-size': `calc(var(--editor-font-size) * ${size})`, 'font-weight': weight, 'margin-bottom': `calc(var(--editor-font-size) * ${after})` })
    }
    declarations('.milkdown .ProseMirror h6', { 'font-size': 'var(--editor-font-size)', 'font-weight': '600', 'margin-bottom': 'calc(var(--editor-font-size) * 0.5)' })
  })
})

describe('application shell foundation', () => {
  it('reduces transitions, keyframe animations, and smooth scrolling without changing final UI states', () => {
    const media = '(prefers-reduced-motion: reduce)'
    for (const selector of ['*', '*::before', '*::after']) {
      declarations(selector, { 'scroll-behavior': 'auto !important', 'transition-duration': '0.01ms !important', 'transition-delay': '0s !important', 'animation-duration': '0.01ms !important', 'animation-delay': '0s !important', 'animation-iteration-count': '1 !important' }, media)
    }
    declarations('.preferences-dialog__backdrop', { animation: 'preferences-backdrop-in 120ms ease-out' })
    declarations('.preferences-dialog', { animation: 'preferences-dialog-in 140ms cubic-bezier(.2, .8, .2, 1)' })
    declarations('.milo-tooltip', { animation: 'milo-tooltip-in 100ms ease-out' })
    for (const selector of ['.preferences-dialog__backdrop', '.preferences-dialog', '.milo-tooltip']) declarations(selector, { animation: 'none !important' }, media)
  })

  it('separates application, context, and editor surfaces with the compact navigation range', () => {
    declarations('.app-shell', { '--application-bar-height': '48px', '--document-context-height': '40px' })
    declarations('.document-area', { 'grid-template-rows': 'var(--document-context-height) minmax(0, 1fr)' })
    declarations('.document-stage', { overflow: 'auto', background: 'var(--surface-editor)' })
    declarations('.file-sidebar', { 'grid-template-rows': 'auto minmax(0, 1fr) auto', 'min-width': '208px', 'max-width': '320px', overflow: 'hidden' })
    declarations('.file-sidebar__body', { overflow: 'auto' })
    const footerBorders = rulesFor('.file-sidebar__footer').flatMap((rule) => rule.nodes.filter((node) => node.type === 'decl' && node.prop === 'border-top'))
    expect(footerBorders).toHaveLength(1)
    declarations('.file-sidebar__resize-handle:focus-visible::after', { background: 'var(--focus-ring)' })
  })

  it('keeps the macOS drag region and makes every application action group interactive', () => {
    declarations('.window-bar', { '-webkit-app-region': 'drag' })
    for (const selector of ['.window-bar__actions', '.document-tab', '.application-bar__tabs > .icon-button-shell']) declarations(selector, { '-webkit-app-region': 'no-drag' })
  })

  it('keeps tabs usable while progressively removing unavailable layout controls', () => {
    declarations('.application-bar__tabs', { flex: '1 1 auto', 'min-width': '0', overflow: 'hidden' })
    declarations('.tab-strip', { flex: '1 1 auto', 'min-width': '0', 'overflow-x': 'auto' })
    declarations('.application-bar__sidebar-toggle', { display: 'none' }, '(max-width: 900px)')
    declarations('.application-bar__focus-toggle', { display: 'none' }, '(max-width: 720px)')
  })

  it('defines theme-specific semantic shell surfaces', () => {
    for (const theme of [':root', '.app-shell[data-theme="dark"]', '.app-shell[data-theme="warm"]']) {
      for (const token of ['surface-shell', 'surface-toolbar', 'surface-context', 'surface-editor', 'surface-outline']) {
        expect(rulesFor(theme).some((rule) => rule.nodes.some((node) => node.type === 'decl' && node.prop === `--${token}`))).toBe(true)
      }
    }
  })

  it('owns overlays through semantic layers and shared floating surfaces', () => {
    for (const token of ['overlay-sticky-chrome', 'overlay-floating-editor', 'overlay-popover', 'overlay-drawer', 'overlay-application-popover', 'overlay-dialog', 'overlay-select', 'overlay-tooltip', 'overlay-critical-alert', 'floating-surface', 'floating-border', 'floating-radius-sm', 'floating-radius-md', 'floating-shadow', 'floating-row-height', 'floating-padding', 'floating-hover', 'floating-active', 'floating-divider']) {
      const selector = ['floating-surface', 'floating-border', 'floating-shadow'].includes(token) ? '.app-shell' : ':root'
      expect(rulesFor(selector).some((rule) => rule.nodes.some((node) => node.type === 'decl' && node.prop === `--${token}`))).toBe(true)
    }
    for (const [selector, layer] of [['.outline-drawer-layer', 'drawer'], ['.window-bar', 'application-popover'], ['.application-more-menu__surface', 'application-popover'], ['.dialog-overlay-layer', 'dialog'], ['.milo-select__content', 'select'], ['.milo-tooltip', 'tooltip']]) declarations(selector, { 'z-index': `var(--overlay-${layer})` })
    declarations('.milo-tooltip', { 'font-size': '12px', 'line-height': '1.25' })
    stylesheet.walkDecls('z-index', (declaration) => { expect(['40', '45', '50', '60', '70', '80']).not.toContain(declaration.value) })
  })

  it('centers a responsive modal preferences surface above its backdrop', () => {
    declarations('.preferences-dialog', { position: 'fixed', top: '50%', left: '50%', width: 'min(520px, calc(100vw - 32px))', 'max-height': 'calc(100vh - 48px)', background: 'var(--floating-surface)', border: '1px solid var(--floating-border)' })
    declarations('.preferences-dialog__backdrop', { position: 'fixed', inset: '0' })
    declarations('body:has(.preferences-dialog__portal) .milo-tooltip', { display: 'none' })
  })

  it('keeps the focus outline entry viewport-fixed while allowing only the drawer outline', () => {
    declarations('.focus-mode-outline-trigger', { position: 'fixed', background: 'var(--surface-raised)', border: '1px solid var(--line)' })
    declarations('.app-shell--focus-mode .editor-outline:not(.editor-outline--drawer)', { display: 'none' })
    absentDeclaration('.app-shell--focus-mode .editor-outline', 'display', 'none')
    declarations('.document-area', { position: 'relative' })
    declarations('.outline-drawer-layer', { position: 'absolute', inset: '0' })
    for (const selector of ['.outline-drawer-layer .outline-backdrop', '.outline-drawer-layer .editor-outline--drawer']) declarations(selector, { position: 'absolute' })
    absentDeclaration('.editor-outline--drawer', 'transform')
    declarations('.app-shell--focus-mode .editor-outline--drawer', { top: '0' })
    declarations('.app-shell--focus-mode .outline-backdrop', { inset: '0' })
  })

  it('polishes inline and drawer outlines without changing their layout roles', () => {
    declarations('.app-shell', { '--outline-width': '256px' })
    declarations('.document-stage', { 'grid-template-columns': 'minmax(0, 1fr) minmax(0, calc(var(--reading-width) + var(--editor-rail-width) + var(--editor-column-gap))) minmax(0, 1fr)' })
    declarations('.app-shell--inline-outline .document-stage', { 'grid-template-columns': 'minmax(0, 1fr) minmax(0, calc(var(--reading-width) + var(--editor-rail-width) + var(--editor-column-gap) + var(--space-6) + var(--outline-width))) minmax(0, 1fr)' })
    declarations('.editor-outline--drawer', { width: 'min(280px, calc(100vw - 24px))' })
    declarations('.editor-outline', { background: 'var(--surface-outline)' })
    declarations('.editor-outline__header', { height: 'var(--document-context-height)', 'border-bottom': '1px solid var(--context-line)' })
    declarations('.editor-outline__item', { position: 'relative', 'min-height': '32px' })
    declarations('.editor-outline__item--active::before', { width: '2px', background: 'var(--accent)', 'pointer-events': 'none' })
    declarations('.editor-outline__item--active', { background: 'var(--outline-active-fill)', 'font-weight': 'var(--font-weight-medium)' })
    declarations('.editor-outline__body::-webkit-scrollbar', { width: '8px' })
    declarations('.editor-outline__body::-webkit-scrollbar-thumb', { background: 'var(--outline-scrollbar-thumb)' })
  })

  it('keeps all six outline levels compact and continuously indented', () => {
    for (const [level, padding] of [['2', '20px'], ['3', '30px'], ['4', '38px'], ['5', '46px'], ['6', '54px']]) declarations(`.editor-outline__item--level-${level}`, { 'padding-left': padding })
    declarations('.editor-outline__item span', { 'text-overflow': 'ellipsis', 'white-space': 'nowrap' })
  })
})

describe('editor table typography', () => {
  it('contains intrinsic table width in the standard TableView wrapper', () => {
    declarations('.milkdown .ProseMirror .tableWrapper', { width: '100%', 'max-width': '100%', 'min-width': '0', 'overflow-x': 'auto' })
    absentDeclaration('.document-stage', 'overflow-x', 'hidden')
    absentDeclaration('.milkdown .ProseMirror table', 'display', 'block')
  })

  it('removes paragraph rhythm only inside table cells while keeping cells vertically centered', () => {
    document.body.innerHTML = `<div class="milkdown"><div class="ProseMirror"><p id="body-paragraph">Body</p><table><thead><tr><th><p id="header-paragraph">Header</p></th></tr></thead><tbody><tr><td><p id="cell-paragraph">Cell</p></td></tr></tbody></table></div></div>`
    const header = document.querySelector<HTMLElement>('th')!
    const cell = document.querySelector<HTMLElement>('td')!
    const headerParagraph = document.querySelector<HTMLElement>('#header-paragraph')!
    const cellParagraph = document.querySelector<HTMLElement>('#cell-paragraph')!
    const bodyParagraph = document.querySelector<HTMLElement>('#body-paragraph')!
    expect(getComputedStyle(header).verticalAlign).toBe('middle')
    expect(getComputedStyle(cell).verticalAlign).toBe('middle')
    for (const selector of ['.milkdown .ProseMirror th > p', '.milkdown .ProseMirror td > p']) declarations(selector, { 'margin-block': '0' })
    expect(headerParagraph.parentElement).toBe(header)
    expect(cellParagraph.parentElement).toBe(cell)
    expect(getComputedStyle(bodyParagraph).marginBottom).not.toBe('0px')
  })
})

describe('editor image integrity states', () => {
  it('keeps local image failure chrome contained and theme-token based', () => {
    for (const selector of ['.local-image-view', '.remote-image-view']) declarations(selector, { display: 'block', 'max-width': '100%' })
    declarations('.local-image-placeholder', { display: 'inline-flex', 'max-width': '100%', color: 'var(--muted-ink)', background: 'var(--soft-fill)', border: '1px solid var(--line)' })
    declarations('.local-image-placeholder__status', { color: 'var(--subtle-ink)' })
    stylesheet.walkRules((rule) => {
      if (list.comma(rule.selector).some((selector) => selector.includes('.local-image-placeholder'))) {
        rule.walkDecls('position', (declaration) => { expect(['fixed', 'absolute']).not.toContain(declaration.value) })
      }
    })
  })

  it('rings the rendered image or placeholder only in edit mode', () => {
    for (const view of ['local', 'remote']) {
      for (const mode of ['.milkdown-editor:not(.milkdown-editor--read)', '.milkdown-editor--read']) declarations(`${mode} .ProseMirror .${view}-image-view.ProseMirror-selectednode`, { outline: 'none' })
      declarations(`.milkdown-editor:not(.milkdown-editor--read) .ProseMirror .${view}-image-view.ProseMirror-selectednode > img`, { outline: '2px solid var(--accent)', 'outline-offset': '3px' })
      declarations(`.milkdown .ProseMirror .${view}-image-view[contenteditable="false"]`, { '-webkit-user-select': 'none', 'user-select': 'none' })
      for (const suffix of ['::selection', ' *::selection']) declarations(`.milkdown .ProseMirror .${view}-image-view${suffix}`, { background: 'transparent' })
    }
    declarations('.milkdown-editor:not(.milkdown-editor--read) .ProseMirror .local-image-view.ProseMirror-selectednode > .local-image-placeholder', { outline: '2px solid var(--accent)', 'outline-offset': '3px' })
  })
})

describe('editor list and quote typography', () => {
  it('keeps list and task paragraphs from inheriting body paragraph spacing', () => {
    declarations('.milkdown .ProseMirror li > p', { 'margin-block': '0' })
    stylesheet.walkRules((rule) => { expect(list.comma(rule.selector).some((selector) => selector.includes('li[data-item-type="task"] > p'))).toBe(false) })
  })

  it('gives blockquotes an independent paragraph rhythm with no trailing gap', () => {
    declarations('.milkdown .ProseMirror blockquote > p', { 'margin-block': '0 0.65em' })
    declarations('.milkdown .ProseMirror blockquote > p:last-child', { 'margin-bottom': '0' })
  })

  it('preserves body and table-cell paragraph spacing boundaries', () => {
    declarations('.milkdown .ProseMirror p', { margin: '0 0 1.12em' })
    for (const selector of ['.milkdown .ProseMirror th > p', '.milkdown .ProseMirror td > p']) declarations(selector, { 'margin-block': '0' })
  })
})

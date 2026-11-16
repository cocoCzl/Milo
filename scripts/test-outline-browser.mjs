import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, settle, browser, errors, output } from './browserHarness.mjs'
const results = []

async function showOutline(page) {
  await settle(page)
  if (!(await page.locator('.editor-outline').count()))
    await page.getByRole('button', { name: '打开大纲', exact: true }).click()
  await page.locator('.editor-outline__body').waitFor()
  const depth = page.getByRole('combobox', { name: '展示标题层级' })
  if ((await depth.count()) && !(await depth.innerText()).includes('H6')) {
    await depth.click()
    await page.getByRole('option', { name: '显示至 H6', exact: true }).click()
  }
  await settle(page)
}

async function depthFocusReturned(page) {
  await page.waitForFunction(
    () => document.activeElement?.classList.contains('milo-select__trigger--outline'),
    undefined,
    { timeout: 2000 },
  )
}

async function depthControl(page, name) {
  async function focusedOption(label) {
    await page.waitForFunction(
      (label) =>
        document.activeElement?.getAttribute('role') === 'option' &&
        document.activeElement?.textContent === label,
      label,
    )
  }
  const trigger = page.getByRole('combobox', { name: '展示标题层级' })
  await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror')
    window.__miloOutlineTest.originalEditor = editor
    window.__miloOutlineTest.originalDoc = editor.pmViewDesc.node
  })
  async function filtered(depth) {
    assert.equal(await trigger.innerText(), depth === 1 ? '仅显示 H1' : `显示至 H${depth}`)
    const measured = await page.evaluate((depth) => {
      const editor = document.querySelector('.ProseMirror')
      return {
        expected: [...editor.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(
          (heading) => Number(heading.tagName.slice(1)) <= depth,
        ).length,
        actual: document.querySelectorAll('.editor-outline__item').length,
        sameEditor: editor === window.__miloOutlineTest.originalEditor,
        sameDoc: editor.pmViewDesc.node === window.__miloOutlineTest.originalDoc,
        stored: localStorage.getItem('milo-outline-depth'),
        writes: window.__miloOutlineTest.writes,
      }
    }, depth)
    assert.equal(measured.actual, measured.expected)
    assert(measured.sameEditor, 'depth change remounted Milkdown')
    assert(measured.sameDoc, 'depth change mutated the Markdown model')
    assert.deepEqual(measured.writes, [], 'outline preferences caused a save')
    if (measured.stored !== null) assert.equal(measured.stored, String(depth))
  }
  await filtered(3)
  assert.equal(await page.locator('.editor-outline select').count(), 0)
  const before = await trigger.boundingBox()
  assert(before.width >= 110 && before.width <= 140)
  await trigger.click()
  assert.equal(
    await page.locator('.milo-select__trigger--outline').getAttribute('aria-expanded'),
    'true',
  )
  const menu = page.getByRole('listbox')
  const menuSize = await menu.boundingBox()
  assert(menuSize.width >= 140 && menuSize.width <= 170)
  assert.equal(await menu.getByRole('option').count(), 6)
  assert.equal(await menu.locator('[data-state="checked"] .lucide-check').count(), 1)
  const colors = await menu.evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color,
    theme: el.closest('.app-shell')?.dataset.theme,
  }))
  assert.notEqual(colors.color, colors.background)
  assert(colors.theme, 'menu lost the application theme portal')
  const optionStyle = await menu
    .getByRole('option')
    .first()
    .evaluate((el) => ({
      weight: Number(getComputedStyle(el).fontWeight),
      height: el.getBoundingClientRect().height,
    }))
  assert(optionStyle.weight <= 450, 'outline menu uses bold text')
  assert(optionStyle.height >= 30, 'outline menu hit targets are too small')
  await page.screenshot({ path: `${output}/${name}-depth-menu.png` })
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached' })
  await depthFocusReturned(page)
  assert.equal(await page.locator('.editor-outline').count(), 1, 'Escape also closed the Drawer')
  for (const depth of [1, 2, 3, 6]) {
    await trigger.click()
    await page
      .getByRole('option', {
        name: depth === 1 ? '仅显示 H1' : `显示至 H${depth}`,
        exact: true,
      })
      .click()
    await menu.waitFor({ state: 'detached' })
    await depthFocusReturned(page)
    await filtered(depth)
  }
  // Keyboard selection commits only on Enter. Escape discards the pending row.
  await trigger.focus()
  await page.keyboard.press('Enter')
  await focusedOption('显示至 H6')
  await page.keyboard.press('Home')
  await focusedOption('仅显示 H1')
  await page.keyboard.press('ArrowDown')
  await focusedOption('显示至 H2')
  await page.keyboard.press('Enter')
  await menu.waitFor({ state: 'detached' })
  await filtered(2)
  await depthFocusReturned(page)
  await page.keyboard.press('ArrowDown')
  await focusedOption('显示至 H2')
  await page.keyboard.press('ArrowUp')
  await focusedOption('仅显示 H1')
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached' })
  await filtered(2)
  await depthFocusReturned(page)
  await showOutline(page)
}

async function metrics(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.document-stage')
    const nav = document.querySelector('.editor-outline')
    const body = nav.querySelector('.editor-outline__body')
    const header = nav.querySelector('.editor-outline__header')
    const last = nav.querySelector('li:last-child button')
    const rect = (el) => el?.getBoundingClientRect().toJSON()
    const h = header.getBoundingClientRect()
    return {
      stage: rect(stage),
      outline: rect(nav),
      body: rect(body),
      header: rect(header),
      last: rect(last),
      stageScrollTop: stage.scrollTop,
      bodyScrollTop: body.scrollTop,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      headerHit: header.contains(document.elementFromPoint(h.x + 40, h.y + h.height / 2)),
      drawer: nav.classList.contains('editor-outline--drawer'),
      rowFont: last ? getComputedStyle(last).fontSize : null,
    }
  })
}

async function wheel(page, deltaY) {
  const box = await page.locator('.editor-outline__body').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, deltaY)
  await page.waitForTimeout(100) // Let native wheel delivery and scroll events finish.
}

function contained(m) {
  assert(m.outline.bottom <= m.stage.bottom + 1, 'outline exceeds workspace')
  assert(m.last.bottom <= m.body.bottom + 1, 'last row clipped')
  assert(m.last.top >= m.body.top - 1, 'last row above scroll viewport')
  assert(m.body.bottom - m.last.bottom >= 12, 'missing trailing scroll space')
  assert(m.body.bottom - m.last.bottom <= 17, 'excessive trailing scroll space')
  assert(m.headerHit, 'outline header is covered by another layer')
}

async function homeMetrics(page) {
  return page.evaluate(() => {
    const area = document.querySelector('.document-area')
    const stage = document.querySelector('.document-stage')
    const group = document.querySelector('.document-empty-state')
    const rect = (el) => el.getBoundingClientRect().toJSON()
    const workspace = rect(area)
    const content = rect(group)
    return {
      workspace,
      content,
      stage: rect(stage),
      centerOffsetX: content.x + content.width / 2 - (workspace.x + workspace.width / 2),
      centerOffsetY: content.y + content.height / 2 - (workspace.y + workspace.height / 2),
      rows: getComputedStyle(area).gridTemplateRows,
      stageRow: getComputedStyle(stage).gridRowStart,
      buttons: [...group.querySelectorAll('button')].map(rect),
      stageScrollHeight: stage.scrollHeight,
      stageHeight: stage.clientHeight,
      stageScrollWidth: stage.scrollWidth,
      stageWidth: stage.clientWidth,
      panels: document.querySelectorAll('.document-panel:not([hidden])').length,
      outline: getComputedStyle(document.querySelector('.outline-inline-layer')).display,
    }
  })
}

function centeredHome(m) {
  assert(Math.abs(m.centerOffsetX) <= 2, 'home group is not horizontally centered in workspace')
  assert(Math.abs(m.centerOffsetY) <= 12, 'home group is not vertically centered in workspace')
  assert.equal(m.panels, 0)
  assert.equal(m.outline, 'none')
  assert(m.stageScrollHeight <= m.stageHeight + 1, 'home has unnecessary vertical scrolling')
  assert(m.stageScrollWidth <= m.stageWidth + 1, 'home overflows horizontally')
  for (const button of m.buttons) {
    assert(button.top >= m.workspace.top && button.bottom <= m.workspace.bottom)
    assert(button.left >= m.workspace.left && button.right <= m.workspace.right)
  }
}

try {
  const homes = []
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [1280, 800],
    [1024, 600],
    [800, 600],
  ]) {
    for (const theme of ['light', 'dark', 'warm']) {
      for (const uiZoom of [100, 140]) {
        const page = await open({ width, height, theme, uiZoom, home: true })
        for (const sidebar of width > 900 ? [false, true] : [false]) {
          if (sidebar) {
            await page.evaluate(() => window.__miloOutlineTest.command('toggle-sidebar'))
            await page.locator('.file-sidebar').waitFor()
            await settle(page)
          }
          const name = `home-${width}x${height}-${theme}-${uiZoom}-${sidebar ? 'sidebar' : 'full'}`
          const measured = await homeMetrics(page)
          await page.screenshot({ path: `${output}/${name}.png` })
          await writeFile(`${output}/${name}.json`, JSON.stringify(measured, null, 2) + '\n')
          centeredHome(measured)
          homes.push({ name, ...measured })
        }
        await page.close()
      }
    }
  }
  await writeFile(`${output}/home-results.json`, JSON.stringify(homes, null, 2) + '\n')
  // Full geometry + real wheel containment + final navigation in every case.
  const cases = []
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [1280, 800],
    [1024, 600],
    [800, 600],
  ]) {
    for (const theme of ['light', 'dark', 'warm']) {
      for (const uiZoom of [100, 140]) cases.push({ width, height, theme, uiZoom })
    }
  }
  cases.push({ width: 1440, height: 900, theme: 'light', uiZoom: 140, docZoom: 160 })
  cases.push({ width: 1024, height: 600, theme: 'dark', uiZoom: 140, docZoom: 160 })
  cases.push({ width: 1440, height: 600, theme: 'warm', sidebar: true, uiZoom: 120 })
  for (const options of cases) {
    const page = await open(options)
    const name = `${options.width}x${options.height}-${options.theme}-${options.uiZoom || 100}${options.docZoom ? `-doc${options.docZoom}` : ''}${options.sidebar ? '-sidebar' : ''}`
    await settle(page)
    if (!(await page.locator('.editor-outline').count()))
      await page.getByRole('button', { name: '打开大纲', exact: true }).click()
    await depthControl(page, name)
    assert.equal(await page.locator('.editor-outline__item').count(), 101)
    const top = await metrics(page)
    assert(top.headerHit)
    await page.screenshot({ path: `${output}/${name}-top.png` })
    await wheel(page, 100000)
    await wheel(page, 1000)
    const bottom = await metrics(page)
    await writeFile(`${output}/${name}-metrics.json`, JSON.stringify({ top, bottom }, null, 2))
    contained(bottom)
    assert.equal(bottom.stageScrollTop, 0, 'outline wheel moved article')
    assert.equal(bottom.header.top, top.header.top, 'header moved with list')
    const last = page.getByRole('button', { name: '32. 最后的收束话术', exact: true })
    await page.mouse.move(700, 70)
    await page.screenshot({ path: `${output}/${name}-bottom.png` })
    await last.focus()
    assert.equal((await metrics(page)).stageScrollTop, 0, 'outline focus moved article')
    await wheel(page, -100000)
    await wheel(page, -1000)
    const back = await metrics(page)
    // Native wheel delivery can leave a one-pixel residual at the scroll
    // boundary on macOS Chromium. Treat that rounding residue as the top.
    assert(Math.abs(back.bodyScrollTop) <= 1, 'outline did not return to its top')
    assert.equal(back.stageScrollTop, 0)
    await wheel(page, 100000)
    await last.click()
    await settle(page)
    if (bottom.drawer) await showOutline(page)
    assert.equal(await last.getAttribute('aria-current'), 'location')
    const destination = await page.evaluate(() => {
      const stage = document.querySelector('.document-stage')
      const heading = [...document.querySelectorAll('.ProseMirror h2')].at(-1)
      return {
        stage: stage.getBoundingClientRect().toJSON(),
        heading: heading.getBoundingClientRect().toJSON(),
        scroll: stage.scrollTop,
      }
    })
    assert(destination.scroll > 0)
    assert(
      destination.heading.top >= destination.stage.top - 1 &&
        destination.heading.bottom <= destination.stage.bottom + 1,
    )
    await page.waitForTimeout(150)
    assert.equal(
      await last.getAttribute('aria-current'),
      'location',
      'navigation active state bounced',
    )
    assert.equal(
      (await metrics(page)).stageScrollTop,
      destination.scroll,
      'navigation scroll bounced',
    )
    results.push({ name, top, bottom, destination })
    await page.close()
  }

  const page = await open()
  await showOutline(page)
  // Real keyboard traversal reaches every item without scrolling the article.
  await page.locator('.editor-outline__item').first().focus()
  const count = await page.locator('.editor-outline__body').evaluate((body) => {
    const buttons = [...body.querySelectorAll('button')]
    return (
      buttons.indexOf([...body.querySelectorAll('.editor-outline__item')].at(-1)) -
      buttons.indexOf(body.querySelector('.editor-outline__item')) +
      1
    )
  })
  for (let i = 1; i < count; i++) await page.keyboard.press('Tab')
  assert.equal(
    await page
      .locator('.editor-outline__item')
      .last()
      .evaluate((el) => el === document.activeElement),
    true,
  )
  assert.equal((await metrics(page)).stageScrollTop, 0)
  // Reverse traversal must follow the same visible controls, without changing
  // the article's current heading. Explicit tabindex supports macOS WebKit's
  // default policy as well as full keyboard access; no OS setting is changed.
  const currentBeforeFocus = await page
    .locator('[aria-current="location"]')
    .getAttribute('data-heading-key')
  for (let i = 1; i < count; i++) await page.keyboard.press('Shift+Tab')
  assert(
    await page
      .locator('.editor-outline__item')
      .first()
      .evaluate((el) => el === document.activeElement),
  )
  assert.equal(
    await page.locator('[aria-current="location"]').getAttribute('data-heading-key'),
    currentBeforeFocus,
  )
  assert.equal((await metrics(page)).stageScrollTop, 0)
  const rootFold = page.locator('.editor-outline__fold').first()
  await rootFold.focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('.editor-outline__item').count(), 1)
  await page.keyboard.press('Tab')
  assert(
    await page
      .locator('.editor-outline__item')
      .first()
      .evaluate((el) => el === document.activeElement),
  )
  await page.keyboard.press('Shift+Tab')
  assert(await rootFold.evaluate((el) => el === document.activeElement))
  await page.keyboard.press('Enter')
  await page.locator('.editor-outline__item').first().focus()
  // Restore the last focus position used by the scrolling checks below.
  for (let i = 1; i < count; i++) await page.keyboard.press('Tab')
  // Same-position rerenders, Read/Edit and current-item-in-view must preserve
  // manual browsing. A subsequent article scroll must reveal the new current.
  const manual = (await metrics(page)).bodyScrollTop
  await page.getByRole('button', { name: '阅读', exact: true }).click()
  assert.equal((await metrics(page)).bodyScrollTop, manual)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  assert.equal((await metrics(page)).bodyScrollTop, manual)
  await page.locator('.document-stage').evaluate((el) => {
    el.scrollTop = 1500
  })
  await settle(page)
  const activeVisible = await page.locator('[aria-current="location"]').evaluate((el) => {
    const row = el.getBoundingClientRect(),
      body = el.closest('.editor-outline__body').getBoundingClientRect()
    return row.top >= body.top - 1 && row.bottom <= body.bottom + 1
  })
  assert(activeVisible)
  const stable = (await metrics(page)).bodyScrollTop
  await page.locator('.document-stage').evaluate((el) => {
    el.scrollTop += 1
  })
  await settle(page)
  assert.equal((await metrics(page)).bodyScrollTop, stable)
  const midArticle = (await metrics(page)).stageScrollTop
  await wheel(page, 100000)
  await wheel(page, 1000)
  assert.equal((await metrics(page)).stageScrollTop, midArticle)
  await wheel(page, -100000)
  await wheel(page, -1000)
  assert.equal((await metrics(page)).stageScrollTop, midArticle)
  await page.getByRole('button', { name: '阅读', exact: true }).click()
  await page.getByRole('button', { name: '32. 最后的收束话术', exact: true }).click()
  assert.equal(
    await page
      .getByRole('button', { name: '32. 最后的收束话术', exact: true })
      .getAttribute('aria-current'),
    'location',
  )
  assert.equal(await page.locator('.ProseMirror').getAttribute('contenteditable'), 'false')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  // Heading IDs, duplicate text and all levels navigate without mutating content.
  for (const layout of ['inline', 'drawer']) {
    await page.setViewportSize({ width: layout === 'inline' ? 1440 : 800, height: 600 })
    await settle(page)
    await showOutline(page)
    for (let level = 1; level <= 6; level++) {
      const row = page.locator(`.editor-outline__item--level-${level}`).first()
      const id = await row.getAttribute('data-heading-id')
      await row.click()
      if (layout === 'drawer') await showOutline(page)
      assert.equal(await row.getAttribute('aria-current'), 'location')
      assert.equal(
        await row.evaluate((el) => getComputedStyle(el).color),
        await page
          .locator('.app-shell')
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--accent').trim())
          .then((hex) =>
            page.evaluate((color) => {
              const el = document.createElement('span')
              el.style.color = color
              document.body.append(el)
              const value = getComputedStyle(el).color
              el.remove()
              return value
            }, hex),
          ),
      )
      assert(
        await page.evaluate((id) => {
          const h = document.getElementById(id).getBoundingClientRect()
          const s = document.querySelector('.document-stage').getBoundingClientRect()
          return h.bottom > s.top && h.top < s.bottom
        }, id),
      )
    }
    const duplicate = page.getByRole('button', { name: '重复标题', exact: true }).nth(24)
    const duplicateId = await duplicate.getAttribute('data-heading-id')
    await duplicate.click()
    if (layout === 'drawer') await showOutline(page)
    assert.equal(await duplicate.getAttribute('aria-current'), 'location')
    assert(duplicateId.includes('#25'))
  }
  // Drawer close/reopen, Escape and focus restoration.
  await page.locator('.editor-outline__close').click()
  await showOutline(page)
  await page.keyboard.press('Escape')
  await page.locator('.editor-outline').waitFor({ state: 'detached' })
  assert.equal(
    await page
      .getByRole('button', { name: '打开大纲', exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  )
  // Resize while open; switch to a second real tab and back.
  await page.setViewportSize({ width: 1440, height: 900 })
  await showOutline(page)
  await page.locator('.editor-outline__body').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await page.setViewportSize({ width: 1280, height: 600 })
  await settle(page)
  await page.locator('.editor-outline__body').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  contained(await metrics(page))
  await page.evaluate(() => window.__miloOutlineTest.open('/test/short.md'))
  await page.getByRole('tab', { name: 'short.md', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('.editor-outline__item').length === 1)
  const short = await metrics(page)
  assert.equal(short.bodyScrollHeight, short.bodyClientHeight)
  assert(short.outline.height < 150)
  await page.getByRole('tab', { name: 'outline-long.md', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelectorAll('.editor-outline__item').length === 101,
  )
  // Focus Mode uses the existing drawer compositor layer.
  await page.evaluate(() => window.__miloOutlineTest.command('toggle-focus-mode'))
  await showOutline(page)
  await page.getByRole('combobox', { name: '展示标题层级' }).click()
  await page.keyboard.press('Escape')
  await depthFocusReturned(page)
  assert.equal(await page.locator('.editor-outline--drawer').count(), 1)
  assert.equal(await page.locator('.app-shell--focus-mode').count(), 1)
  await wheel(page, 100000)
  contained(await metrics(page))
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.__miloOutlineTest.command('toggle-focus-mode'))
  // Editing and Auto Save still use the real document session, with in-memory IPC.
  await page.locator('.document-panel:not([hidden]) .ProseMirror p').first().click()
  await page.keyboard.type('outline-regression-edit')
  await page.waitForFunction(() =>
    window.__miloOutlineTest.writes.some((w) => w.markdown.includes('outline-regression-edit')),
  )
  const saved = await page.evaluate(() => window.__miloOutlineTest.writes.at(-1))
  assert(saved.markdown.includes('## 32. 最后的收束话术'))
  await page.close()

  for (const content of [
    '正文没有标题。',
    '# 短文档\n\n正文。',
    `# ${'超长中文标题 mixed English '.repeat(25)}\n\n正文。`,
  ]) {
    const page = await open({ content })
    await showOutline(page)
    const size = await page.locator('.editor-outline__body').evaluate((el) => ({
      scroll: el.scrollHeight,
      client: el.clientHeight,
      width: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    assert.equal(size.scroll, size.client)
    assert.equal(size.width, size.clientWidth)
    if (content.startsWith('#'))
      assert.equal(
        await page.locator('.editor-outline__item').getAttribute('title'),
        content.split('\n')[0].slice(2).trim(),
      )
    await page.close()
  }
  const find = await open({ content: '# 章节\n\n中文 Hello hello\n\n```js\nhello 中文\n```\n' })
  assert.equal(await find.locator('.ProseMirror').count(), 1)
  await find.keyboard.press('Meta+f')
  await find.getByRole('textbox', { name: '文内查找' }).fill('hello')
  await find.waitForFunction(() => document.querySelectorAll('.document-find-match').length === 3)
  await find.keyboard.press('Enter')
  assert.equal(await find.locator('.document-find output').textContent(), '2 / 3')
  await find.keyboard.press('Shift+Enter')
  assert.equal(await find.locator('.document-find output').textContent(), '1 / 3')
  await find.keyboard.press('Escape')
  assert.equal(await find.locator('.document-find-match').count(), 0)
  assert.deepEqual(await find.evaluate(() => window.__miloOutlineTest.writes), [])
  await find.getByRole('button', { name: '阅读', exact: true }).click()
  await find.keyboard.press('Meta+f')
  await find.getByRole('textbox', { name: '文内查找' }).fill('中文')
  await find.waitForFunction(() => document.querySelectorAll('.document-find-match').length === 2)
  await find.keyboard.press('Escape')
  assert.deepEqual(await find.evaluate(() => window.__miloOutlineTest.writes), [])
  await find.close()

  const lazy = await open({ tabs: 5 })
  assert.equal(
    await lazy.locator('.ProseMirror').count(),
    1,
    'background editors initialized eagerly',
  )
  await lazy.locator('.document-panel:not([hidden]) .ProseMirror p').first().click()
  await lazy.keyboard.type('lazy-undo-check')
  await lazy.waitForFunction(() =>
    window.__miloOutlineTest.writes.some((w) => w.markdown.includes('lazy-undo-check')),
  )
  await showOutline(lazy)
  await lazy.evaluate(() => {
    window.__miloOutlineTest.editedDoc = document.querySelector('.ProseMirror').pmViewDesc.node
  })
  const lazyDepth = lazy.getByRole('combobox', { name: '展示标题层级' })
  for (const name of ['仅显示 H1', '显示至 H6']) {
    await lazyDepth.click()
    await lazy.getByRole('option', { name, exact: true }).click()
    await depthFocusReturned(lazy)
  }
  assert(
    await lazy.evaluate(
      () =>
        window.__miloOutlineTest.editedDoc ===
        document.querySelector('.ProseMirror').pmViewDesc.node,
    ),
  )
  const scroll = await lazy.locator('.document-stage').evaluate((stage) => {
    stage.scrollTop = 1500
    return stage.scrollTop
  })
  await lazy.evaluate(() => {
    window.__miloOutlineTest.firstEditor = document.querySelector(
      '.document-panel:not([hidden]) .ProseMirror',
    )
  })
  await lazy.getByRole('tab', { name: 'tab-2.md', exact: true }).click()
  await lazy.locator('.document-panel:not([hidden]) .milkdown-editor[aria-busy="false"]').waitFor()
  assert.equal(await lazy.locator('.ProseMirror').count(), 2)
  await lazy.getByRole('tab', { name: 'outline-long.md', exact: true }).click()
  assert.equal(await lazy.locator('.document-stage').evaluate((stage) => stage.scrollTop), scroll)
  assert(
    await lazy.evaluate(
      () =>
        document.querySelector('.document-panel:not([hidden]) .ProseMirror') ===
        window.__miloOutlineTest.firstEditor,
    ),
  )
  await lazy.locator('.document-panel:not([hidden]) .ProseMirror').focus()
  await lazy.keyboard.press('Meta+z')
  await lazy.waitForFunction(
    () =>
      !document
        .querySelector('.document-panel:not([hidden]) .ProseMirror')
        .textContent.includes('lazy-undo-check'),
  )
  await lazy.keyboard.press('Meta+Shift+z')
  await lazy.waitForFunction(() =>
    document
      .querySelector('.document-panel:not([hidden]) .ProseMirror')
      .textContent.includes('lazy-undo-check'),
  )
  await lazy.close()

  for (const uiZoom of [100, 140]) {
    const fitted = await open({
      uiZoom,
      content: '# Root\n\nParagraph.\n\n## Child\n\nParagraph.\n\n# Last\n\nEnd.',
    })
    await showOutline(fitted)
    const stage = fitted.locator('.document-stage')
    assert.equal(await stage.evaluate((el) => el.scrollHeight - el.clientHeight), 0)
    const nav = fitted.getByRole('navigation', { name: '大纲', exact: true })
    const root = nav.getByRole('button', { name: 'Root', exact: true })
    const last = nav.getByRole('button', { name: 'Last', exact: true })
    assert.equal(await root.getAttribute('aria-current'), 'location')
    await last.focus()
    assert(await last.evaluate((el) => el === document.activeElement))
    assert.equal(
      await root.getAttribute('aria-current'),
      'location',
      'focus changed current chapter',
    )
    assert.equal(await last.getAttribute('aria-current'), null)
    const feedback = await last.evaluate((el) => {
      const active = document.querySelector('.editor-outline__item--active')
      return {
        focusOutline: getComputedStyle(el).outlineStyle,
        focusFill: getComputedStyle(el).backgroundColor,
        activeFill: getComputedStyle(active).backgroundColor,
      }
    })
    assert.equal(feedback.focusOutline, 'solid')
    assert.notEqual(
      feedback.focusFill,
      feedback.activeFill,
      'keyboard focus looks like current chapter',
    )
    assert.equal(await stage.evaluate((el) => el.scrollTop), 0)
    assert.deepEqual(await fitted.evaluate(() => window.__miloOutlineTest.writes), [])
    await fitted.close()
  }

  // Depth is local UI storage and survives a real document close/reopen.
  for (const width of [1440, 800]) {
    const persistent = await open({ width, height: 900 })
    await showOutline(persistent)
    const trigger = persistent.getByRole('combobox', { name: '展示标题层级' })
    await trigger.click()
    await persistent.getByRole('option', { name: '显示至 H2', exact: true }).click()
    const count = await persistent.locator('.editor-outline__item').count()
    const original = await persistent
      .locator('.ProseMirror')
      .evaluate((el) => el.pmViewDesc.node.toJSON())
    await persistent.locator('.document-tab__close').click()
    await persistent.locator('.document-empty-state').waitFor()
    await persistent.evaluate(() => window.__miloOutlineTest.open('/test/outline-long.md'))
    await persistent.locator('.milkdown-editor[aria-busy="false"] .ProseMirror').waitFor()
    if (!(await persistent.locator('.editor-outline').count()))
      await persistent.getByRole('button', { name: '打开大纲', exact: true }).click()
    await trigger.waitFor()
    assert.equal(await trigger.innerText(), '显示至 H2')
    assert.equal(await persistent.locator('.editor-outline__item').count(), count)
    assert.deepEqual(
      await persistent.locator('.ProseMirror').evaluate((el) => el.pmViewDesc.node.toJSON()),
      original,
    )
    assert.deepEqual(await persistent.evaluate(() => window.__miloOutlineTest.writes), [])
    await persistent.close()
  }
  const english = await open({ locale: 'en', uiZoom: 140 })
  const englishDepth = english.getByRole('combobox', { name: 'Heading levels' })
  assert.equal(await englishDepth.innerText(), 'Show to H3')
  await englishDepth.click()
  assert.deepEqual(await english.getByRole('option').allTextContents(), [
    'Only H1',
    'Show to H2',
    'Show to H3',
    'Show to H4',
    'Show to H5',
    'Show to H6',
  ])
  await english.screenshot({ path: `${output}/english-140-depth-menu.png` })
  await english.keyboard.press('Escape')
  await depthFocusReturned(english)
  await english.close()

  const closed = await open()
  await closed.locator('.document-tab__close').click()
  await closed.locator('.document-empty-state').waitFor()
  centeredHome(await homeMetrics(closed))
  await closed.setViewportSize({ width: 800, height: 600 })
  await settle(closed)
  centeredHome(await homeMetrics(closed))
  await closed.close()
  const system = await open({ theme: 'system' })
  for (const colorScheme of ['dark', 'light']) {
    await system.emulateMedia({ colorScheme })
    await system.waitForFunction(
      (theme) => document.querySelector('.app-shell').dataset.theme === theme,
      colorScheme,
    )
  }
  await system.close()
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        engine: browser.version(),
        cases: results,
        interactionChecks:
          'Radix depth mouse/arrow/Enter/Escape/focus return, H1–H6 filtering, depth persistence, unchanged Markdown model/editor/save calls, keyboard, modes, active visibility, all levels, duplicate IDs, drawer, resize, tabs, focus, edit/autosave, short/empty/long title, English, system theme',
        pageErrors: errors,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    `PASS: ${homes.length} Home geometry cases, ${results.length} Outline layout cases and application interaction regressions. Artifacts: ${output}`,
  )
} finally {
  await browser.close()
}

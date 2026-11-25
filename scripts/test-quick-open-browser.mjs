// Real UI + synthetic IPC: streaming, partial failure, cancellation and minimum-size keyboard acceptance.
import assert from 'node:assert/strict'
import { open, browser, output, errors } from './browserHarness.mjs'
try {
  const p = await open({ home: true, width: 720, height: 520, uiZoom: 140 })
  await p.getByRole('button', { name: '新建文档', exact: true }).focus()
  await p.evaluate(() => {
    const t = window.__miloOutlineTest
    t.browse = async ({ path, offset }) => {
      const tree = (children) => ({
        path,
        name: path.split('/').at(-1),
        isDirectory: true,
        children: children.map((child) => ({ ...child, children: [] })),
        nextOffset: null,
      })
      if (path === '/test' && !offset)
        return tree([
          { path: '/test/无权限', name: '无权限', isDirectory: true },
          { path: '/test/研究笔记', name: '研究笔记', isDirectory: true },
          { path: '/test/归档', name: '归档', isDirectory: true },
        ])
      if (path === '/test/无权限') throw Error('权限不足')
      return tree([{ path: `${path}/同名文档.md`, name: '同名文档.md', isDirectory: false }])
    }
    t.setFile('/test/研究笔记/同名文档.md', '# 目标文档\n\n继续写作。')
    t.setFile('/test/归档/同名文档.md', '# 归档')
  })
  await p.keyboard.press('Meta+p')
  await p.getByRole('combobox', { name: '快速打开' }).waitFor()
  assert.equal(await p.evaluate(() => window.__miloOutlineTest.pickCalls), 1)
  await p.getByRole('option', { name: '同名文档.md 研究笔记', exact: true }).waitFor()
  await p.locator('.quick-open__partial').waitFor()
  await p.keyboard.press('Home')
  await p.keyboard.press('ArrowDown')
  await p.keyboard.press('ArrowUp')
  await p.keyboard.press('ArrowDown')
  assert.equal(
    await p.locator('[role="option"][aria-selected="true"] small').textContent(),
    '研究笔记',
  )
  const bounds = await p.locator('.quick-open').boundingBox()
  assert(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= 721 &&
      bounds.y + bounds.height <= 521,
  )
  await p.screenshot({ path: `${output}/quick-minimum-partial.png` })
  await p.evaluate(() => {
    window.__miloOutlineTest.read = async () => {
      throw Error('第一次打开失败')
    }
  })
  await p.keyboard.press('Enter')
  await p.getByRole('alert').waitFor()
  await p.screenshot({ path: `${output}/quick-minimum-retry.png` })
  await p.evaluate(() => {
    delete window.__miloOutlineTest.read
  })
  await p.getByRole('alert').getByRole('button', { name: '重试', exact: true }).click()
  await p.getByRole('tab', { name: '同名文档.md', exact: true }).waitFor()
  await p
    .waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('.document-panel:not([hidden]) .ProseMirror'),
      null,
      { timeout: 3000, polling: 20 },
    )
    .catch(async (error) => {
      console.log(
        await p.evaluate(() => ({
          active: document.activeElement?.tagName,
          panel: document.querySelector('.document-panel:not([hidden])')?.outerHTML.slice(0, 1800),
          dialogs: document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
        })),
      )
      throw error
    })
  assert.equal(
    await p.evaluate(
      () =>
        window.__miloOutlineTest.reads.filter((path) => path === '/test/研究笔记/同名文档.md')
          .length,
    ),
    2,
  )
  await p.bringToFront()
  const restoredEditor = p.locator('.document-panel:not([hidden]) .ProseMirror')
  const originalText = await restoredEditor.textContent()
  // Use real navigation keys so ProseMirror owns the selection before opening.
  await p.keyboard.press('Meta+ArrowDown')
  for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowLeft')
  for (let i = 0; i < 2; i++) await p.keyboard.press('Shift+ArrowLeft')
  assert.equal(await p.evaluate(() => getSelection().toString()), '继续')

  await p.keyboard.press('Meta+p')
  await p.getByRole('combobox').waitFor()
  await p.keyboard.press('Escape')
  await p.keyboard.type('SELECTION')
  assert(
    (await restoredEditor.textContent()).includes('SELECTION写作。'),
    await p.evaluate(() =>
      JSON.stringify({
        text: document.querySelector('.ProseMirror')?.textContent,
        active: document.activeElement?.outerHTML.slice(0, 100),
        selection: getSelection().toString(),
      }),
    ),
  )
  await p.keyboard.press('Meta+z')
  assert.equal(await restoredEditor.textContent(), originalText)
  // Cancel pending A, open B, then release A. The old completion must be inert.
  await p.evaluate(() => {
    const t = window.__miloOutlineTest
    t.setFile('/test/A.md', '# A')
    t.setFile('/test/B.md', '# B')
    t.browse = async ({ path }) => ({
      path,
      name: path.split('/').at(-1),
      isDirectory: true,
      children: ['A', 'B'].map((n) => ({
        path: `/test/${n}.md`,
        name: `${n}.md`,
        isDirectory: false,
        children: [],
      })),
      nextOffset: null,
    })
    t.read = (path) =>
      path === '/test/A.md'
        ? new Promise((resolve) => {
            t.finishA = () => resolve({ path, markdown: '# A', lineEnding: 'lf', hasBom: false })
          })
        : Promise.resolve({ path, markdown: '# B', lineEnding: 'lf', hasBom: false })
  })
  await p.keyboard.press('Meta+p')
  await p.getByRole('combobox').fill('A.md')
  await p.getByRole('option', { name: /A.md/ }).waitFor()
  await p.keyboard.press('Enter')
  await p
    .waitForFunction(() => !!window.__miloOutlineTest.finishA, null, { polling: 50, timeout: 3000 })
    .catch(async (error) => {
      console.log(
        await p.evaluate(() => ({
          active: document.activeElement?.outerHTML,
          reads: window.__miloOutlineTest.reads,
          body: document.body.innerText,
        })),
      )
      await p.screenshot({ path: `${output}/failure.png` })
      throw error
    })
  await p.keyboard.press('Escape')
  assert.equal(await p.locator('.quick-open').count(), 0)
  // Radix restores focus in its unmount callback. Verify the next keyboard
  // input reaches the original editor rather than sampling before cleanup.
  await p.keyboard.type('AFTER_ESC')
  assert(
    (await p.locator('.document-panel:not([hidden]) .ProseMirror').textContent()).includes(
      'AFTER_ESC',
    ),
  )
  assert(
    await p
      .locator('.document-panel:not([hidden]) .ProseMirror')
      .evaluate((el) => el === document.activeElement),
  )
  await p.keyboard.press('Meta+p')
  await p.getByRole('combobox').fill('B.md')
  await p.getByRole('option', { name: /B.md/ }).waitFor()
  await p.keyboard.press('Enter')
  await p.getByRole('tab', { name: 'B.md', exact: true }).waitFor()
  await p.waitForFunction(
    () =>
      document.activeElement ===
      document.querySelector('.document-panel:not([hidden]) .ProseMirror'),
  )
  await p.evaluate(() => window.__miloOutlineTest.finishA())

  assert.equal(await p.getByRole('tab', { name: 'A.md', exact: true }).count(), 0)
  assert.equal(
    await p.getByRole('tab', { name: 'B.md', exact: true }).getAttribute('aria-selected'),
    'true',
  )
  assert.equal(await p.locator('.folder-error').count(), 0)
  await p.close()
  assert.deepEqual(errors, [])
  console.log(
    'PASS: first ⌘P, 720×520/140%, partial scan, path keyboard selection, original-file retry and A-cancel/B/late-A race (simulated IPC)',
  )
} finally {
  await browser.close()
}

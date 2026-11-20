// Actual UI and keyboard/pointer events, simulated IPC; not native permissions or IME.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, output, errors } from './browserHarness.mjs'
const strict = process.env.MILO_RECOVERY_STRICT === '1'
const cases = []
const content =
  '# 写作中的保存恢复\n\n' +
  Array.from(
    { length: 32 },
    (_, i) =>
      `第${i + 1}段：把观察写清楚，保留当前思路。恢复操作应能找到，也应给正文留下足够空间。`,
  ).join('\n\n')
async function observe(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.document-stage')
    const footer = document.querySelector('.document-feedback-layer')
    const selection = getSelection()
    return {
      editorFocused: document.activeElement?.matches('.ProseMirror, .source-editor textarea'),
      scrollTop: stage.scrollTop,
      anchor: selection?.anchorNode?.textContent,
      anchorOffset: selection?.anchorOffset,
      focus: selection?.focusNode?.textContent,
      focusOffset: selection?.focusOffset,
      height: footer.getBoundingClientRect().height,
      stageHeight: stage.getBoundingClientRect().height,
      expanded: document.querySelector('.save-recovery').open,
    }
  })
}
try {
  for (const long of [false, true]) {
    const page = await open({ content, width: 720, height: 520, uiZoom: 140 })
    await page.bringToFront()
    const editor = page.locator('.ProseMirror')
    await editor.locator('p').nth(12).click()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.insertText('RECOVERY_DENSITY')
    await page.evaluate((long) => {
      window.__miloOutlineTest.writeError =
        'Permission denied (os error 13)' + (long ? ' /long-system-path/'.repeat(500) : '')
    }, long)
    await page.keyboard.press('Meta+s')
    const alert = page.getByRole('alert')
    await alert.waitFor()
    const initial = await observe(page)
    assert(initial.editorFocused)
    await page.screenshot({ path: `${output}/${long ? 'long' : 'normal'}-initial.png` })
    const summary = alert.locator('.save-recovery > summary')
    await summary.click()
    const folded = await observe(page)
    assert(!folded.expanded)
    for (const name of ['重试', '另存为'])
      assert(await alert.getByRole('button', { name, exact: true }).isVisible())
    assert(await summary.isVisible())
    if (strict) {
      assert(folded.editorFocused, 'Pointer folding must preserve editor focus')
      for (const key of ['anchor', 'anchorOffset', 'focus', 'focusOffset'])
        assert.equal(folded[key], initial[key])
      assert(
        Math.abs(folded.scrollTop - initial.scrollTop) <= 1,
        JSON.stringify({ initial, folded }),
      )
    }
    await page.screenshot({ path: `${output}/${long ? 'long' : 'normal'}-folded.png` })
    if (!strict) await editor.focus()
    const beforeExpand = await observe(page)
    await summary.click()
    const expanded = await observe(page)
    if (strict) {
      assert(expanded.editorFocused)
      for (const key of ['anchor', 'anchorOffset', 'focus', 'focusOffset'])
        assert.equal(expanded[key], beforeExpand[key])
      assert(Math.abs(expanded.scrollTop - beforeExpand.scrollTop) <= 1)
    }
    if (!strict) await editor.focus()
    await alert.locator('.save-error-message > details > summary').click()
    const technical = await observe(page)
    if (strict) {
      assert(technical.editorFocused)
      for (const key of ['anchor', 'anchorOffset', 'focus', 'focusOffset'])
        assert.equal(technical[key], initial[key])
      assert(Math.abs(technical.scrollTop - initial.scrollTop) <= 1)
      await page.keyboard.type('AFTER_DISCLOSURE')
      assert((await editor.textContent()).includes('RECOVERY_DENSITYAFTER_DISCLOSURE'))
      await page.keyboard.press('Meta+z')
      assert(!(await editor.textContent()).includes('AFTER_DISCLOSURE'))
    }
    assert(await alert.locator('pre').isVisible())
    await summary.focus()
    await page.keyboard.press('Enter')
    const next = process.env.MILO_BROWSER === 'webkit' ? 'Alt+Tab' : 'Tab'
    await page.keyboard.press(next)
    const retry = alert.getByRole('button', { name: '重试', exact: true })
    assert(await retry.evaluate((el) => el === document.activeElement))
    await retry.scrollIntoViewIfNeeded()
    await page.locator('.document-feedback-layer').evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    const bounds = await retry.boundingBox()
    assert(bounds.y >= 0 && bounds.y + bounds.height <= 520)
    await page.keyboard.press(next)
    assert(
      await alert
        .getByRole('button', { name: '另存为', exact: true })
        .evaluate((el) => el === document.activeElement),
    )
    await page.evaluate(() => {
      window.__miloOutlineTest.writeError = false
    })
    await retry.click()
    await page.waitForFunction(() => window.__miloOutlineTest.writes.length > 0)
    assert.equal(await alert.count(), 0)
    cases.push({
      long,
      initial,
      folded,
      expanded,
      technical,
      keyboardReachable: true,
      retrySucceeded: true,
    })
    await page.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ strict, cases, errors, source: 'browser simulated IPC' }, null, 2),
  )
  console.log('PASS recovery observation', { strict, cases })
} finally {
  await browser.close()
}

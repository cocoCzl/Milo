// Real UI, simulated IPC; no real OS IME or file permission evidence.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, errors, output } from './browserHarness.mjs'
const cases = []
// WebKit follows macOS's default text-controls-only Tab preference; Option+Tab includes buttons.
const nextControl = process.env.MILO_BROWSER === 'webkit' ? 'Alt+Tab' : 'Tab'
try {
  for (const theme of ['light', 'dark', 'warm']) {
    for (const width of [1280, 720]) {
      const page = await open({
        theme,
        width,
        height: width === 720 ? 520 : 820,
        uiZoom: 140,
        content:
          '# 长文写作\n\n' + '正文应当保持可输入，错误恢复需要清楚且可以使用。\n\n'.repeat(30),
      })
      const editor = page.locator('.ProseMirror')
      await editor.focus()
      await page.keyboard.press('Control+End')
      const marker = `保留-${theme}-${width}`
      await page.keyboard.insertText(marker)
      await page.evaluate(() => {
        window.__miloOutlineTest.writeError =
          'Permission denied (os error 13) ' + '/very-long-system-path/'.repeat(150)
      })
      await page.keyboard.press('Meta+s')
      const alert = page.getByRole('alert')
      await alert.waitFor()
      assert(await editor.evaluate((el) => el === document.activeElement))
      const retry = alert.getByRole('button', { name: '重试', exact: true })
      const saveAs = alert.getByRole('button', { name: '另存为', exact: true })
      assert.notEqual(
        await retry.evaluate((el) => getComputedStyle(el).backgroundColor),
        await saveAs.evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      await alert.getByText('查看原始错误').click()
      for (const control of [retry, saveAs]) {
        await control.scrollIntoViewIfNeeded()
        await page.locator('.document-feedback-layer').evaluate((el) => {
          el.scrollTop = el.scrollHeight
        })
        const b = await control.boundingBox()
        assert(
          b.x >= 0 &&
            b.x + b.width <= width &&
            b.y >= 0 &&
            b.y + b.height <= (width === 720 ? 520 : 820),
        )
      }
      await alert.locator('.save-recovery > summary').focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press(nextControl)
      assert(
        await retry.evaluate((el) => el === document.activeElement),
        await page.evaluate(() => document.activeElement?.outerHTML),
      )
      assert(
        await retry.evaluate(
          (el) => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none',
        ),
      )
      await page.keyboard.press(nextControl)
      assert(await saveAs.evaluate((el) => el === document.activeElement))
      await page.evaluate(() => {
        window.__miloOutlineTest.writeError = false
        window.__miloOutlineTest.savePath = '/test/recovered.md'
      })
      await page.keyboard.press('Enter')
      await page.getByRole('tab', { name: 'recovered.md', exact: true }).waitFor()
      const writes = await page.evaluate(() => window.__miloOutlineTest.writes)
      assert(writes.some((w) => w.path === '/test/recovered.md' && w.markdown.includes(marker)))
      assert.equal(await page.getByRole('alert').count(), 0)
      cases.push({
        theme,
        width,
        uiZoom: 140,
        focusRetained: true,
        longDetailsReachable: true,
        keyboardSaveAs: true,
        contentPreserved: true,
      })
      await page.close()
    }
  }
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ cases, errors, source: 'browser simulated IPC' }, null, 2),
  )
  console.log(
    'PASS six theme/size combinations: long permission error, focus, primary/secondary actions and keyboard Save As retaining content',
  )
} finally {
  await browser.close()
}

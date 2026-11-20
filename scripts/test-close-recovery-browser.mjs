// Real App/Milkdown, synthetic IME and IPC failures. Not real macOS IME evidence.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, errors, output } from './browserHarness.mjs'
const cases = []
try {
  for (const [kind, content, target] of [
    ['paragraph', '# 退出验证\n\n段落：', 'p'],
    ['code', '# 退出验证\n\n```text\n代码输入：\n```\n', 'pre'],
    ['table', '# 退出验证\n\n| 输入 | 对照 |\n| --- | --- |\n| 内容： | 保留 |\n', 'td p'],
  ]) {
    const page = await open({ content, width: 720, height: 520, uiZoom: 140 })
    const editor = page.locator('.document-panel:not([hidden]) .ProseMirror')
    await editor.focus()
    await editor.evaluate((el, target) => {
      window.__observedDecisions = 0
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes)
            if (
              node instanceof Element &&
              (node.matches('.close-confirmation') || node.querySelector('.close-confirmation'))
            )
              window.__observedDecisions++
      }).observe(document.body, { subtree: true, childList: true })
      const block = el.querySelector(target)
      const range = document.createRange()
      range.selectNodeContents(block)
      range.collapse(false)
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      block.textContent += 'zhongwen'
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertCompositionText',
          isComposing: true,
          data: 'zhongwen',
        }),
      )
      window.__miloOutlineTest.requestClose()
    }, target)
    await page.getByRole('status').filter({ hasText: '请确认或取消当前输入' }).waitFor()
    assert.equal(await page.getByRole('alertdialog').count(), 0)
    assert(await editor.evaluate((el) => document.activeElement === el && !el.closest('[inert]')))
    await editor.evaluate((el, target) => {
      const block = el.querySelector(target)
      block.textContent = block.textContent.replace('zhongwen', '中文')
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertFromComposition',
          isComposing: false,
          data: '中文',
        }),
      )
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }))
    }, target)
    await page.waitForFunction(() => window.__miloOutlineTest.commands.includes('complete_close'))
    const result = await page.evaluate(() => ({
      writes: window.__miloOutlineTest.writes,
      decisions: window.__observedDecisions,
    }))
    assert.equal(
      result.decisions,
      0,
      'Drain confirmed saved documents without a transient decision',
    )
    assert(
      result.writes.length > 0 &&
        result.writes.every((w) => w.markdown.includes('中文') && !w.markdown.includes('zhongwen')),
    )
    cases.push({ kind, ...result })
    await page.close()
  }
  const page = await open({
    content: '# 窄窗保存失败\n\n这里的正文与未保存修改必须仍可看见。\n\n第二段保留。',
    width: 720,
    height: 520,
    uiZoom: 140,
  })
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText('最新修改')
  await page.evaluate(() => {
    window.__miloOutlineTest.writeError =
      'Could not create temporary file: Permission denied (os error 13)'
  })
  await page.keyboard.press('Meta+s')
  const alert = page.getByRole('alert')
  await alert.filter({ hasText: '没有此文件或所在文件夹的写入权限' }).waitFor()
  assert(await alert.getByText('修改仍保留在当前标签中，可重试或另存为。').isVisible())
  for (const name of ['重试', '另存为'])
    assert(await alert.getByRole('button', { name, exact: true }).isVisible())
  await page.screenshot({ path: `${output}/permission-720-collapsed.png` })
  await alert.getByText('查看原始错误').click()
  assert(
    await alert
      .getByText('Could not create temporary file: Permission denied (os error 13)', {
        exact: true,
      })
      .isVisible(),
  )
  const bounds = await page.locator('.document-feedback-layer').boundingBox()
  assert(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= 720 &&
      bounds.y + bounds.height <= 520,
  )
  assert(await editor.isVisible())
  for (const name of ['重试', '另存为']) {
    const button = alert.getByRole('button', { name, exact: true })
    await button.scrollIntoViewIfNeeded()
    await page.locator('.document-feedback-layer').evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    const box = await button.boundingBox()
    assert(
      box.y >= bounds.y && box.y + box.height <= 520,
      `${name} stays reachable within the scrollable recovery row: ${JSON.stringify({ box, bounds })}`,
    )
  }
  const stageBounds = await page.locator('.document-stage').boundingBox()
  const footerBounds = await page.locator('.document-feedback-layer').boundingBox()
  assert(
    stageBounds.y + stageBounds.height <= footerBounds.y + 1,
    'Recovery reserves space instead of covering the editor',
  )
  await alert.locator('.save-recovery > summary').click()
  assert(await alert.getByRole('button', { name: '重试', exact: true }).isVisible())
  assert(await alert.getByRole('button', { name: '另存为', exact: true }).isVisible())
  await alert.locator('.save-recovery > summary').click()
  await alert.getByRole('button', { name: '重试', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${output}/permission-720-expanded.png` })
  await page.evaluate(() => window.__miloOutlineTest.requestClose())
  const decision = page.getByRole('alertdialog')
  await decision.waitFor()
  assert.equal(
    await page.getByRole('alert').count(),
    0,
    'Save error is presented inside the active decision',
  )
  await page.screenshot({ path: `${output}/permission-720-quit-decision.png` })
  await page.waitForTimeout(1300)
  assert(await decision.isVisible(), 'A real failure decision must not auto dismiss')
  await page.keyboard.press('Tab')
  assert(
    await decision.locator('summary').evaluate((el) => el === document.activeElement),
    'Original error must be reachable inside the modal focus loop',
  )
  await page.keyboard.press('Enter')
  assert(await decision.locator('details').evaluate((el) => el.open))
  await page.screenshot({ path: `${output}/permission-720-quit-details.png` })
  await page.keyboard.press('Shift+Tab')
  assert(
    await decision
      .getByRole('button', { name: '继续编辑', exact: true })
      .evaluate((el) => el === document.activeElement),
  )
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  assert.equal(await page.getByRole('alertdialog').count(), 0)
  assert(await editor.textContent().then((t) => t.includes('最新修改')))
  await page.evaluate(() => {
    window.__miloOutlineTest.writeError = false
  })
  await page.getByRole('alert').getByRole('button', { name: '重试', exact: true }).click()
  await page.waitForFunction(() => window.__miloOutlineTest.writes.length > 0)
  cases.push({
    kind: 'permission-recovery',
    bounds,
    retained: true,
    decisionStable: true,
    retrySucceeded: true,
  })
  await page.close()
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ cases, errors, source: 'browser', realIME: false }, null, 2),
  )
  console.log(
    'PASS synthetic IME close draining, stable save-error choice and narrow Chinese permission recovery',
  )
} finally {
  await browser.close()
}

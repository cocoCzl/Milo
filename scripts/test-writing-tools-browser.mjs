// Real React/Milkdown in a browser; all native IPC is isolated in memory.
import assert from 'node:assert/strict'
import { open, browser, output, errors } from './browserHarness.mjs'
try {
  for (const theme of ['light', 'dark', 'warm']) {
    const page = await open({
      theme,
      width: 1280,
      height: 800,
      uiZoom: theme === 'dark' ? 140 : 100,
      folder: '/test',
      content:
        '# 开始\n\nHello **hello** HELLO.\n\n[指南](./short.md#短文档)\n\n## 结束\n\n最后一段。\n',
    })
    await page.getByRole('button', { name: '阅读', exact: true }).click()
    await page.getByRole('link', { name: '指南' }).click()
    await page.getByRole('tab', { name: 'short.md', exact: true }).waitFor()
    assert.equal(await page.getByRole('tab').count(), 2)
    await page.getByRole('button', { name: '返回上一位置' }).click()
    await page.waitForFunction(() =>
      document
        .querySelector('[role="tab"][aria-selected="true"]')
        .textContent.includes('outline-long.md'),
    )
    await page.getByRole('button', { name: '编辑', exact: true }).click()
    await page.keyboard.press('Meta+f')
    await page.getByRole('textbox', { name: '文内查找', exact: true }).fill('hello')
    await page.waitForFunction(() =>
      document.querySelector('.document-find output').textContent.includes('3'),
    )
    await page.getByRole('textbox', { name: '替换', exact: true }).fill('中文')
    await page.getByRole('button', { name: '全部替换', exact: true }).click()
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.document-find').count(), 0)
    await page.keyboard.press('Meta+s')
    await page.waitForFunction(() =>
      window.__miloOutlineTest.writes.some((w) => w.markdown.includes('中文 **中文** 中文')),
    )
    await page.screenshot({ path: `${output}/tools-${theme}-edit.png` })
    await page.getByRole('button', { name: '源码', exact: true }).click()
    const source = page.getByRole('textbox', {
      name: 'outline-long.md Markdown 源码（完整文件）',
      exact: true,
    })
    await source.waitFor()
    const unchanged = await source.inputValue()
    const writesBefore = await page.evaluate(() => window.__miloOutlineTest.writes.length)
    await page.getByRole('button', { name: '阅读', exact: true }).click()
    await page.getByRole('button', { name: '源码', exact: true }).click()
    await source.waitFor()
    assert.equal(await source.inputValue(), unchanged)
    assert.equal(await page.evaluate(() => window.__miloOutlineTest.writes.length), writesBefore)
    // Source changes create an explicit visual-history boundary and retain a
    // read-only previous-source checkpoint in the same tab.
    const changedSource = '# 源码修改\n\nalpha **alpha** ALPHA.\n'
    await source.fill(changedSource)
    await page.getByRole('button', { name: '编辑', exact: true }).click()
    await page.locator('.document-panel:not([hidden]) .ProseMirror').waitFor()
    await page.getByRole('button', { name: '源码', exact: true }).click()
    await page.getByRole('button', { name: '复制上次源码编辑前的版本' }).waitFor()
    const raw = '---\ntitle: source test\n---\n\n# 原文\n\n<div>原始 HTML</div>\n'
    await source.fill(raw)
    await page.keyboard.press('Meta+s')
    await page.waitForFunction(
      (raw) => window.__miloOutlineTest.writes.at(-1)?.markdown === raw,
      raw,
    )
    await page.getByRole('button', { name: '编辑', exact: true }).click()
    await page.getByText(/源码包含暂不支持的语法/).waitFor()
    assert.equal(await source.inputValue(), raw)
    await page.screenshot({ path: `${output}/tools-${theme}-source.png` })
    await page.keyboard.press('Meta+p')
    const query = page.getByRole('combobox', { name: '快速打开' })
    await query.fill('short')
    await page.getByRole('option', { name: /short.md/ }).waitFor()
    await page.screenshot({ path: `${output}/tools-${theme}-quick-open.png` })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() =>
      document.querySelector('[role="tab"][aria-selected="true"]').textContent.includes('short.md'),
    )
    assert.equal(await page.getByRole('tab').count(), 2)
    await page.close()
  }
  assert.deepEqual(errors, [])
  console.log(
    `PASS: links/back, replacement/save, unchanged/source/protected save, quick open, three themes/high zoom (${process.env.MILO_BROWSER || 'chromium'}; simulated IPC)`,
  )
} finally {
  await browser.close()
}

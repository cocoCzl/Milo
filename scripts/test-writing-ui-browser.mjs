// Layout evidence uses real App/Milkdown and synthetic IPC failures only.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { open, browser, errors, output } from './browserHarness.mjs'
const content =
  (await readFile(new URL('../tests/fixtures/outline-long.md', import.meta.url), 'utf8')) +
  '\n\n> 引用与 English quotation。\n\n- **重点** · mixed list\n- 第二项\n\n| 中文列 | English |\n| --- | --- |\n| 单元格 | value |\n\n```unknown-lang\nconst 示例 = "写作";\n```\n'
try {
  for (const theme of ['light', 'dark', 'warm']) {
    const page = await open({
      content,
      theme,
      folder: '/test',
      sidebar: true,
      width: 1280,
      height: 800,
      uiZoom: theme === 'dark' ? 140 : 100,
    })
    await page.evaluate(() => {
      for (const path of [
        '/test/研究笔记/同名文档.md',
        '/test/归档/长路径与中文目录/同名文档.md',
        '/test/特别长的合成文档文件名称用于检查标签与结果布局.md',
      ])
        window.__miloOutlineTest.setFile(path, '# 合成文档\n\n可丢弃内容。\n')
    })
    await page.screenshot({ path: `${output}/writing-${theme}-long.png` })
    await page.keyboard.press('Meta+p')
    const query = page.getByRole('combobox', { name: '快速打开' })
    await query.fill('同名')
    assert.equal(await page.getByRole('option').count(), 2)
    assert.equal(
      await page
        .locator('[role="option"] small')
        .allTextContents()
        .then((paths) => new Set(paths).size),
      2,
    )
    await page.screenshot({ path: `${output}/writing-${theme}-duplicate-paths.png` })
    await query.fill('no-synthetic-match')
    await page.getByText('没有匹配的 Markdown 文件。').waitFor()
    await page.screenshot({ path: `${output}/writing-${theme}-empty.png` })
    await page.keyboard.press('Escape')
    await page.evaluate(() => {
      window.__miloOutlineTest.browseError = true
    })
    await page.keyboard.press('Meta+p')
    await page.getByRole('button', { name: /Synthetic folder read failure/ }).waitFor()
    await page.screenshot({ path: `${output}/writing-${theme}-folder-error.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '源码', exact: true }).click()
    const source = page.getByRole('textbox', { name: /Markdown 源码/ })
    await source.fill(content + '\n' + 'Long source line 中文 English '.repeat(150))
    assert.equal(await source.evaluate((el) => getComputedStyle(el).resize), 'none')
    await page.screenshot({ path: `${output}/writing-${theme}-source.png` })
    await page.evaluate(() => {
      window.__miloOutlineTest.writeError = true
    })
    await page.keyboard.press('Meta+s')
    await page.getByText('Synthetic disk write failure', { exact: true }).first().waitFor()
    assert((await source.inputValue()).includes('Long source line'))
    await page.screenshot({ path: `${output}/writing-${theme}-save-error.png` })
    await page.close()
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS: long writing, duplicate paths, empty/error quick open, Source layout and retained save failure; three themes (simulated IPC).',
  )
} finally {
  await browser.close()
}

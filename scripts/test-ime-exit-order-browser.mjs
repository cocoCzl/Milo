// Synthetic DOM composition + real App/editor, simulated IPC. Never human IME evidence.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, settle, browser, output, errors } from './browserHarness.mjs'
const samples = []
try {
  for (const [kind, order, confirmed] of [
    ['code', 'end-first', '中文'],
    ['code', 'input-first', '中文'],
    ['code', 'end-first', 'zhongwen'],
    ['paragraph', 'end-first', '中文'],
    ['table', 'input-first', '中文'],
  ]) {
    const prefix = kind === 'code' ? '代码输入：' : kind === 'table' ? '表格输入：' : '段落输入：'
    const initial =
      kind === 'code'
        ? `# 单例\n\n\`\`\`text\n${prefix}\n\`\`\`\n`
        : kind === 'table'
          ? `| 项目 | 内容 |\n| --- | --- |\n| 输入 | ${prefix} |\n`
          : `# 单例\n\n${prefix}\n`
    const selector = kind === 'code' ? 'pre' : kind === 'table' ? 'td:last-child' : 'p'
    const page = await open({ content: initial })
    const editor = page.locator('.ProseMirror')
    await editor.focus()
    const block = editor.locator(selector).last()
    await block.evaluate((el, prefix) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
      el.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          inputType: 'insertCompositionText',
          data: 'zhongwen',
          isComposing: true,
        }),
      )
      el.textContent = prefix + 'zhongwen'
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertCompositionText',
          data: 'zhongwen',
          isComposing: true,
        }),
      )
      window.__miloOutlineTest.requestClose()
    }, prefix)
    await page.getByRole('status').filter({ hasText: '请确认或取消当前输入' }).waitFor()
    await settle(page)
    const waiting = await page.evaluate(() => ({
      writes: window.__miloOutlineTest.writes.length,
      approved: window.__miloOutlineTest.commands.includes('complete_close'),
    }))
    assert.equal(waiting.writes, 0)
    assert(!waiting.approved)
    await block.evaluate(
      (el, { prefix, confirmed, order }) => {
        const end = () =>
          el.dispatchEvent(
            new CompositionEvent('compositionend', { bubbles: true, data: confirmed }),
          )
        const input = () => {
          el.dispatchEvent(
            new InputEvent('beforeinput', {
              bubbles: true,
              inputType: 'insertFromComposition',
              data: confirmed,
              isComposing: false,
            }),
          )
          el.textContent = prefix + confirmed
          el.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              inputType: 'insertFromComposition',
              data: confirmed,
              isComposing: false,
            }),
          )
        }
        if (order === 'end-first') {
          end()
          input()
        } else {
          input()
          end()
        }
      },
      { prefix, confirmed, order },
    )
    await page.waitForFunction(() => window.__miloOutlineTest.commands.includes('complete_close'))
    const result = await page.evaluate(() => ({
      writes: window.__miloOutlineTest.writes,
      commands: window.__miloOutlineTest.commands,
    }))
    assert.equal(
      result.writes.length,
      1,
      'Repeated exit coordination must not duplicate this stable write',
    )
    assert(result.writes[0].markdown.includes(prefix + confirmed))
    if (confirmed === '中文') assert(!result.writes[0].markdown.includes('zhongwen'))
    const reopened = await open({ content: result.writes[0].markdown })
    await reopened.locator('.ProseMirror').waitFor()
    await reopened.waitForFunction(
      ({ selector, text }) =>
        [...document.querySelectorAll('.ProseMirror ' + selector)].some(
          (el) => el.textContent === text,
        ),
      { selector, text: prefix + confirmed },
    )
    samples.push({ kind, order, confirmed, waiting, ...result, reopenedFromWrittenMarkdown: true })
    await reopened.close()
    await page.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/ime-exit-order.json`,
    JSON.stringify(
      {
        source:
          'automated synthetic composition, browser simulated IPC; renderer reopened from written Markdown, not native process/disk verification',
        samples,
        errors,
      },
      null,
      2,
    ),
  )
  console.log('PASS IME exit ordering: code/paragraph/table; retain the actual confirmed text')
} finally {
  await browser.close()
}

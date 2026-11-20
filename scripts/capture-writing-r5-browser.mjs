// Real UI, browser with simulated IPC. Paired captures use identical content/settings.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, output, errors } from './browserHarness.mjs'
const content = `# 把复杂的事，写清楚

一个安静的写作空间，应该让注意力停留在内容上。我们把想法拆成可以讨论的小问题，再用具体的事实把它们连接起来。

写作并不总是从完整的结论开始。今天的笔记记录了一次产品讨论：保留仍然有价值的设计，也给尚未想清楚的部分留出余地。

## 先找到真正的问题

界面的反馈需要和实际发生的事情一致。保存失败时，作者应当知道修改还在，也能直接找到下一步。

- 当前文档清楚可辨，状态不只依靠颜色。
- 键盘能够到达每一个必要的操作。
- 标签切换之后，可以接着上一句话写下去。

> 好的工具把复杂性收好，让人有时间认真思考。

## 将证据留在身边

| 观察 | 下一步 |
| --- | --- |
| 第一次打开会分配缓冲 | 记录重复操作后的变化 |
| 结果还不确定 | 保留问题与原始证据 |

\`\`\`typescript
const note = { title: '一份可以继续的笔记', saved: true }
function continueWriting() {
  return note.title
}
\`\`\`

最后检查正文、选区和保存结果，然后继续写作。\n`
const captures = []
try {
  for (const [name, theme, width, height] of [
    ['daily', 'light', 1280, 820],
    ['permission', 'light', 720, 520],
    ['selection', 'dark', 1280, 820],
    ['focus', 'warm', 1280, 820],
  ]) {
    if (process.env.MILO_CAPTURE_SCENE && name !== process.env.MILO_CAPTURE_SCENE) continue
    const p = await open({
      content,
      theme,
      width,
      height,
      uiZoom: 140,
      folder: '/test',
      tabs: name === 'daily' ? 3 : 1,
    })
    const editor = p.locator('.document-panel:not([hidden]) .ProseMirror')
    if (name === 'permission') {
      await p.evaluate(() => {
        window.__miloOutlineTest.writeError =
          'Could not create the Safe Save recovery marker: Permission denied (os error 13)'
      })
      await editor.focus()
      await p.keyboard.press('ArrowDown')
      await p.keyboard.insertText('未保存的写作记录。')
      await p.keyboard.press('Meta+s')
      await p.getByRole('alert').filter({ hasText: '没有此文件或所在文件夹的写入权限' }).waitFor()
      assert(
        await editor.evaluate((el) => el === document.activeElement),
        'Save failure must retain editor focus',
      )
    }
    if (name === 'selection') {
      await p.bringToFront()
      await editor.evaluate((el) => {
        el.focus()
        const text = el.querySelector('p').firstChild
        const range = document.createRange()
        range.setStart(text, 0)
        range.setEnd(text, Math.min(text.length, 38))
        getSelection().removeAllRanges()
        getSelection().addRange(range)
      })
      await p.keyboard.press('Shift+ArrowRight')
      assert((await p.evaluate(() => getSelection().toString())).length > 0)
      await p
        .locator('.selection-toolbar:not(.selection-toolbar--measuring)')
        .waitFor({ state: 'visible' })
    }
    if (name === 'focus')
      await p.getByRole('button', { name: '进入专注模式', exact: true }).first().click()
    await p.screenshot({ path: `${output}/${name}.png` })
    captures.push({
      name,
      theme,
      width,
      height,
      uiZoom: 140,
      documentZoom: 100,
      source: 'browser WebKit; simulated IPC',
      build: process.env.MILO_CAPTURE_BUILD,
    })
    await p.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/${process.env.MILO_CAPTURE_SCENE ? `captures-${process.env.MILO_CAPTURE_SCENE}` : 'captures'}.json`,
    JSON.stringify({ captures, content, errors }, null, 2),
  )
} finally {
  await browser.close()
}

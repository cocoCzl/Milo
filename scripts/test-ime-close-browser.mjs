// Synthetic composition verifies layout/focus and close ordering. Real macOS
// input-method acceptance is recorded separately and cannot be inferred here.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, settle, browser, output, errors } from './browserHarness.mjs'

const samples = []
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 720, height: 520 },
  ]) {
    const page = await open({
      ...viewport,
      uiZoom: 140,
      theme: 'dark',
      content: '# 中文输入法验收\n\n段落：',
    })
    const editor = page.locator('.document-panel:not([hidden]) .ProseMirror')
    await editor.focus()
    const before = await page.locator('.document-stage').boundingBox()
    await editor.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      el.querySelector('p').textContent = '段落：zhong wen'
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'zhong wen',
          inputType: 'insertCompositionText',
          isComposing: true,
        }),
      )
      window.__miloOutlineTest.requestClose()
    })
    await page.getByRole('status').filter({ hasText: '请确认或取消当前输入' }).waitFor()
    await settle(page)
    const after = await page.locator('.document-stage').boundingBox()
    const waiting = await editor.evaluate((el) => ({
      focused: document.activeElement === el,
      inert: el.closest('[inert]') !== null,
      text: el.textContent,
      closeCommands: window.__miloOutlineTest.commands.filter((cmd) => cmd === 'complete_close'),
    }))
    await page.screenshot({ path: `${output}/ime-close-wait-${viewport.width}.png` })
    const sample = { viewport, before, after, waiting }
    samples.push(sample)
    await writeFile(`${output}/ime-close.json`, JSON.stringify({ samples, errors }, null, 2))
    assert.deepEqual(after, before, 'Waiting notice must not move or collapse the editor stage')
    assert(waiting.focused && !waiting.inert, 'Keep composition focus and editor interaction')
    assert.equal(waiting.closeCommands.length, 0, 'Do not close before confirmed input')
    await editor.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }))
      el.querySelector('p').textContent = '段落：中文'
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: '中文',
          inputType: 'insertFromComposition',
          isComposing: false,
        }),
      )
    })
    // A dirty guard may be present until autosave finishes. Completion must
    // follow a successful write of the confirmed text, never preedit text.
    await page.waitForFunction(() => window.__miloOutlineTest.commands.includes('complete_close'))
    sample.writes = await page.evaluate(() => window.__miloOutlineTest.writes)
    assert(sample.writes.length > 0)
    assert(sample.writes.every((write) => write.markdown.includes('段落：中文')))
    await page.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/ime-close.json`, JSON.stringify({ samples, errors }, null, 2))
  console.log('PASS synthetic close composition: stable layout/focus and confirmed disk writes')
} finally {
  await browser.close()
}

// Browser event-to-render observations, simulated IPC; not native filesystem latency.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, errors, output } from './browserHarness.mjs'
const samples = []
try {
  for (let round = 0; round < 5; round++) {
    const p = await open({
      content: '# 写作记录\n\n继续输入正文。',
      folder: '/test',
      width: 1280,
      height: 820,
      uiZoom: 140,
    })
    const editor = p.locator('.ProseMirror')
    await editor.focus()
    await p.evaluate(() => {
      window.__quickTiming = { start: null, visible: null, operable: null }
      document.addEventListener(
        'keydown',
        (e) => {
          if (e.metaKey && e.key.toLowerCase() === 'p')
            window.__quickTiming.start = performance.now()
        },
        true,
      )
      function sample() {
        const t = window.__quickTiming
        const dialog = document.querySelector('.quick-open')
        if (t.start !== null && dialog && dialog.getBoundingClientRect().height > 0) {
          t.visible ??= performance.now()
          if (
            document.activeElement?.getAttribute('role') === 'combobox' &&
            document.querySelector('[role=option]')
          )
            t.operable ??= performance.now()
        }
        if (t.operable === null) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await p.keyboard.press('Meta+p')
    await p.waitForFunction(() => window.__quickTiming.operable !== null)
    const t = await p.evaluate(() => window.__quickTiming)
    samples.push({ round, visibleMs: t.visible - t.start, operableMs: t.operable - t.start })
    await p.keyboard.press('Escape')
    assert(await editor.evaluate((el) => el === document.activeElement))
    await p.keyboard.type(`round${round}`)
    assert((await editor.textContent()).includes(`round${round}`))
    await p.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        build: process.env.MILO_CAPTURE_BUILD,
        source:
          'browser WebKit simulated IPC; requestAnimationFrame observation, ~one refresh interval resolution, not physical display time',
        samples,
        errors,
      },
      null,
      2,
    ),
  )
  console.log(samples)
} finally {
  await browser.close()
}

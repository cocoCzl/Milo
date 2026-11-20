// Production HTTP paths with real App and synthetic native IPC. Bytes are
// uncompressed response bodies, not DMG bytes or native WKWebView startup time.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, output, errors } from './browserHarness.mjs'

try {
  const page = await open({ home: true, folder: '/test' })
  const stages = []
  async function snapshot(stage) {
    stages.push(
      await page.evaluate((stage) => {
        const resources = performance.getEntriesByType('resource').map((entry) => ({
          path: new URL(entry.name).pathname,
          bodyBytes: entry.decodedBodySize,
          transferBytes: entry.transferSize,
          durationMs: entry.duration,
        }))
        const commands = window.__miloOutlineTest.commands
        return {
          stage,
          resources,
          totalBodyBytes: resources.reduce((sum, entry) => sum + entry.bodyBytes, 0),
          editors: document.querySelectorAll('.ProseMirror').length,
          watches: commands.filter((cmd) => cmd === 'plugin:fs|watch').length,
          writes: window.__miloOutlineTest.writes.length,
        }
      }, stage),
    )
  }
  await page.waitForTimeout(2100)
  await snapshot('Home, 2.1s idle')
  assert.equal(stages[0].editors, 0)
  assert.equal(stages[0].watches, 0)
  assert.equal(stages[0].writes, 0)
  assert(!stages[0].resources.some((entry) => /MilkdownEditor|milkdown-/.test(entry.path)))
  await page.keyboard.press('Meta+p')
  await page.getByRole('option').first().waitFor()
  await snapshot('first Quick Open')
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.__miloOutlineTest.open('/test/outline-long.md'))
  await page.locator('.ProseMirror').waitFor()
  await snapshot('first document')
  assert.equal(stages.at(-1).editors, 1)
  assert.equal(stages.at(-1).watches, 1)
  await writeFile(`${output}/loading.json`, JSON.stringify({ stages }, null, 2))
  assert.deepEqual(errors, [])
  await page.close()
  console.log('PASS: production Home has no Milkdown/editor/watch/write; first-use paths recorded')
} finally {
  await browser.close()
}

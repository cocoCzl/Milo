// Same 100 KB synthetic text and five edits spaced 200 ms, on each source.
// Diagnostic instrumentation measures serializer calls only, no text/keys logged.
import { writeFile } from 'node:fs/promises'
import { open, browser, output } from './browserHarness.mjs'
import { samples } from './performanceSamples.mjs'
const results = []
try {
  for (let sample = 0; sample < 3; sample++) {
    const page = await open({ content: samples['plain-100kb'] })
    await page.locator('.ProseMirror p').first().click()
    for (let i = 0; i < 5; i++) {
      await page.keyboard.type('x')
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(450)
    const beforeSave = await page.evaluate(() => structuredClone(window.__miloMetrics))
    await page.keyboard.press('Meta+s')
    await page.waitForFunction(() => window.__miloOutlineTest.writes.length > 0)
    const afterSave = await page.evaluate(() => structuredClone(window.__miloMetrics))
    results.push({ sample, beforeSave, afterSave })
    await page.close()
  }
  await writeFile(
    `${output}/serialization.json`,
    JSON.stringify(
      {
        mode: 'Chromium; Vite development; mocked IPC; 100KB plain text; 5 edits spaced 200ms; 3 runs; serializer time is not input latency',
        engine: browser.version(),
        results,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(results)
} finally {
  await browser.close()
}

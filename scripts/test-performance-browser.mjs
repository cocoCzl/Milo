// Comparative DEVELOPMENT-browser observations. Never native budget sign-off.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, output } from './browserHarness.mjs'
const samples = []
const long = Array.from(
  { length: 1000 },
  (_, i) => `## ${i + 1}. 中文章节\n\n正文 English content.\n`,
).join('\n')
const unit =
  '# Document\n\n' +
  '中文 English paragraph sentence. '.repeat(80) +
  '\n\n**strong** and [link](https://example.com).\n\n```ts\nconst value = 1\n```\n\n| A | B |\n| - | - |\n| x | |\n\n'
const megabyte = unit.repeat(Math.ceil(1_000_000 / Buffer.byteLength(unit)))
try {
  for (const scenario of ['home', 'restore', '1MB', 'headings', 'tabs-5', 'tabs-10']) {
    for (let sample = 0; sample < 5; sample++) {
      console.log(`${scenario} sample ${sample}`)
      const start = performance.now()
      const page = await open({
        home: scenario === 'home',
        content: scenario === '1MB' ? megabyte : scenario === 'headings' ? long : undefined,
        tabs: scenario.startsWith('tabs-') ? Number(scenario.slice(5)) : 1,
      })
      const readyMs = performance.now() - start
      await page.waitForTimeout(600) // Allow background restore/initialization before counting editors.
      const measurements = await page.evaluate(() => {
        let contains = 0,
          geometry = 0
        const originalContains = Node.prototype.contains
        const originalRect = Element.prototype.getBoundingClientRect
        Node.prototype.contains = function (...args) {
          contains++
          return originalContains.apply(this, args)
        }
        Element.prototype.getBoundingClientRect = function (...args) {
          geometry++
          return originalRect.apply(this, args)
        }
        const stage = document.querySelector('.document-stage')
        const start = performance.now()
        for (let i = 0; i < 60; i++) {
          stage.scrollTop = i * 100
          stage.dispatchEvent(new Event('scroll'))
        }
        const scrollMs = performance.now() - start
        Node.prototype.contains = originalContains
        Element.prototype.getBoundingClientRect = originalRect
        return {
          scrollMs,
          contains,
          geometry,
          editors: document.querySelectorAll('.ProseMirror').length,
          tabs: document.querySelectorAll('[role="tab"]').length,
        }
      })
      samples.push({
        scenario,
        sample,
        readyMs,
        bytes: scenario === '1MB' ? Buffer.byteLength(megabyte) : null,
        ...measurements,
      })
      await page.close()
    }
  }
  assert(samples.every((s) => Number.isFinite(s.readyMs)))
  await writeFile(
    `${output}/performance.json`,
    JSON.stringify(
      {
        mode: 'Vite development; warm browser; IPC in memory; Playwright navigation-to-ready (includes page creation and two frames)',
        engine: browser.version(),
        samples,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`PASS: ${samples.length} comparative samples in ${output}/performance.json`)
} finally {
  await browser.close()
}

// Development Chromium + in-memory IPC. No native/IME/performance budget claim.
import { writeFile } from 'node:fs/promises'
import { open, browser, output } from './browserHarness.mjs'
const count = 300
const content = Array.from(
  { length: count },
  (_, i) => `\`\`\`ts\nconst value${i} = ${i}\n\`\`\``,
).join('\n\n')
const samples = []
try {
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    const page = await open({ content })
    samples.push({
      readyMs: performance.now() - start,
      ...(await page.evaluate(() => ({
        cards: document.querySelectorAll('.code-block-card').length,
        menus: document.querySelectorAll('.code-block-card__language-menu').length,
        elements: document.querySelector('.ProseMirror').querySelectorAll('*').length,
      }))),
    })
    await page.close()
  }
  await writeFile(
    `${output}/code-blocks.json`,
    JSON.stringify(
      {
        engine: browser.version(),
        mode: 'Vite development; Chromium; mocked IPC; warm browser',
        bytes: Buffer.byteLength(content),
        count,
        samples,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(samples)
} finally {
  await browser.close()
}

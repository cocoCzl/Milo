// Same-size text controls isolate line layout from Markdown/session work.
import { writeFile } from 'node:fs/promises'
import { open, browser, output } from './browserHarness.mjs'
import { samples as original } from './performanceSamples.mjs'
const workloads = {
  'original-plain': original['plain-1mb'],
  'original-structured': original['structured-1mb'],
  'one-long-line': 'a'.repeat(1_000_000),
  '1000-lines': ('a'.repeat(999) + '\n').repeat(1000),
  '10000-lines': ('a'.repeat(99) + '\n').repeat(10000),
  '10000-lines-crlf': ('a'.repeat(98) + '\r\n').repeat(10000),
  '10000-markdown-lines': ('# title **bold** [link](example.md) ' + 'a'.repeat(64) + '\n').repeat(
    10000,
  ),
}
const records = []
try {
  for (const [kind, content] of Object.entries(workloads)) {
    if (process.env.MILO_SOURCE_KINDS && !process.env.MILO_SOURCE_KINDS.split(',').includes(kind))
      continue
    for (let round = 0; round < Number(process.env.MILO_SOURCE_ROUNDS || 1); round++)
      for (const mode of (process.env.MILO_SOURCE_MODES || 'milo,minimal,minimal-default').split(
        ',',
      )) {
        const p = await open({ content: '# Source matrix\n' })
        await p.getByRole('button', { name: '源码', exact: true }).click()
        const field = p.locator('.source-editor textarea')
        await field.waitFor()
        await field.evaluate((el, content) => {
          const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          set.call(el, content)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }, content)
        if (mode !== 'milo')
          await field.evaluate((el, mode) => {
            const clone = el.cloneNode(false)
            clone.value = el.value
            el.closest('.source-editor').replaceChildren(clone)
            if (mode === 'minimal-default')
              clone.addEventListener('input', () => (clone.defaultValue = clone.value))
          }, mode)
        const el = p.locator('.source-editor textarea')
        await el.focus()
        await el.evaluate((el) => {
          el.setSelectionRange(el.value.length, el.value.length)
          window.__sourceRows = []
          let start
          el.addEventListener('beforeinput', () => (start = performance.now()))
          el.addEventListener('input', () =>
            queueMicrotask(() => window.__sourceRows.push(performance.now() - start)),
          )
        })
        for (let i = 0; i < 30; i++) {
          if (process.env.MILO_SOURCE_INPUT === 'key') await p.keyboard.press('x')
          else await p.keyboard.insertText('x')
        }
        const times = await p.evaluate(() => window.__sourceRows)
        await p.keyboard.press('Meta+Alt+Shift+j')
        const profile = await p.evaluate(() =>
          window.__miloOutlineTest.profiles.filter((x) => x.kind === 'technical'),
        )
        records.push({
          kind,
          round,
          input: process.env.MILO_SOURCE_INPUT || 'insertText',
          mode,
          bytes: Buffer.byteLength(content),
          lines: content.split('\n').length,
          times,
          profile,
        })
        console.log(kind, mode, [...times].sort((a, b) => a - b)[28])
        await p.close()
      }
    await writeFile(
      `${output}/source-matrix.json`,
      JSON.stringify({ browser: process.env.MILO_BROWSER || 'chromium', records }, null, 2),
    )
  }
} finally {
  await browser.close()
}

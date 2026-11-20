// Development-browser evidence only; raw samples retain precise boundaries.
import { writeFile } from 'node:fs/promises'
import { open, browser, output } from './browserHarness.mjs'
const samples = []
try {
  for (const count of [100, 1000, 10000])
    for (let round = 0; round < 3; round++) {
      console.log('quick', count, round)
      const p = await open({ home: true, folder: '/test' })
      await p.evaluate((count) => {
        const t = window.__miloOutlineTest
        t.browse = async ({ offset = 0 }) => {
          await new Promise((r) => setTimeout(r, 20))
          return {
            children: Array.from({ length: Math.min(200, count - offset) }, (_, i) => ({
              path: `/test/目录/文档-${offset + i}.md`,
              name: `文档-${offset + i}.md`,
              isDirectory: false,
            })),
            nextOffset: offset + 200 < count ? offset + 200 : null,
          }
        }
        t.measure = {}
        document.addEventListener(
          'keydown',
          (e) => {
            if (e.metaKey && e.key === 'p') t.measure.trigger = performance.now()
          },
          true,
        )
        new MutationObserver(() => {
          const q = document.querySelector('.quick-open input')
          if (q && document.activeElement === q && !t.measure.input)
            t.measure.input = performance.now()
          if (document.querySelector('.quick-open [role=option]') && !t.measure.first)
            t.measure.first = performance.now()
        }).observe(document.body, { subtree: true, childList: true, attributes: true })
      }, count)
      await p.keyboard.press('Meta+p')
      await p.getByRole('option').first().waitFor()
      await p.waitForFunction(
        () =>
          ![...document.querySelectorAll('.quick-open [role=status]')].some((el) =>
            /正在打开|仍在搜索|Opening document|Still searching/.test(el.textContent),
          ),
        null,
        {
          polling: 20,
        },
      )
      const first = await p.evaluate(() => ({
        ...window.__miloOutlineTest.measure,
        complete: performance.now(),
        ipc: window.__miloOutlineTest.browseCalls.length,
      }))
      await p.keyboard.press('Escape')
      await p.keyboard.press('Meta+p')
      await p.getByRole('option').first().waitFor()
      await p.waitForFunction(
        () =>
          ![...document.querySelectorAll('.quick-open [role=status]')].some((el) =>
            /正在打开|仍在搜索|Opening document|Still searching/.test(el.textContent),
          ),
        null,
        {
          polling: 20,
        },
      )
      const second = await p.evaluate(
        () => performance.now() - window.__miloOutlineTest.measure.trigger,
      )
      samples.push({
        scenario: 'quick',
        count,
        round,
        inputMs: first.input - first.trigger,
        firstMs: first.first - first.trigger,
        completeMs: first.complete - first.trigger,
        ipc: first.ipc,
        secondMs: second,
      })
      await p.close()
    }
  for (const count of [100, 1000])
    for (let round = 0; round < 3; round++) {
      const p = await open({
        content: Array.from(
          { length: count },
          (_, i) => `## ${i + 1}. 中文章节\n\n正文 English。\n`,
        ).join('\n'),
      })
      const m = await p.evaluate(() => {
        let contains = 0,
          geometry = 0
        const c = Node.prototype.contains,
          r = Element.prototype.getBoundingClientRect
        Node.prototype.contains = function (...a) {
          contains++
          return c.apply(this, a)
        }
        Element.prototype.getBoundingClientRect = function (...a) {
          geometry++
          return r.apply(this, a)
        }
        const s = document.querySelector('.document-stage'),
          start = performance.now()
        for (let i = 0; i < 60; i++) {
          s.scrollTop = i * 100
          s.dispatchEvent(new Event('scroll'))
        }
        const ms = performance.now() - start
        Node.prototype.contains = c
        Element.prototype.getBoundingClientRect = r
        return { ms, contains, geometry }
      })
      samples.push({ scenario: 'headings', count, round, ...m })
      await p.close()
    }
  for (const kind of ['plain', 'structured', 'crlf'])
    for (let round = 0; round < 3; round++) {
      const { samples: workloads } = await import('./performanceSamples.mjs')
      let content = workloads[kind === 'plain' ? 'plain-1mb' : 'structured-1mb']
      if (kind === 'crlf') content = content.replace(/\n/g, '\r\n')
      console.log('source', kind, round)
      const p = await open({ content: '# 合成 Source 基准\n' })
      await p.getByRole('button', { name: '源码', exact: true }).click()
      const source = p.getByRole('textbox', { name: /Markdown 源码/ })
      await source.waitFor()
      await source.fill(content)
      await source.press('Control+End')
      await source.evaluate((el) => {
        window.__sourceTimes = []
        let start = 0
        el.addEventListener('beforeinput', () => (start = performance.now()))
        el.addEventListener('input', () => {
          queueMicrotask(() => window.__sourceTimes.push(performance.now() - start))
        })
      })
      for (let i = 0; i < 30; i++) await p.keyboard.insertText('x')
      await p.keyboard.insertText('粘贴'.repeat(16667))
      await p.keyboard.press('Meta+s')
      await p.waitForFunction(() => window.__miloOutlineTest.writes.length > 0, null, {
        polling: 20,
      })
      samples.push({
        scenario: 'source',
        kind,
        round,
        bytes: Buffer.byteLength(content),
        times: await p.evaluate(() => window.__sourceTimes),
        writes: await p.evaluate(() => window.__miloOutlineTest.writes.length),
      })
      await p.close()
    }
  await writeFile(
    `${output}/measurements.json`,
    JSON.stringify(
      {
        boundary:
          'Vite development, synthetic IPC; quick DOM-command to focused input/first option/completion; headings synchronous 60 scroll events; Source beforeinput to input microtask (includes React event processing), 30 single-char inputs then ~100KB paste; not native or pixel acceptance',
        samples,
      },
      null,
      2,
    ),
  )
  console.log('PASS:', samples.length, 'measurement samples')
} finally {
  await browser.close()
}

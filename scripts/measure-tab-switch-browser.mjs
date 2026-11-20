// Browser-only switching contract and timing; native memory is sampled separately.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, output } from './browserHarness.mjs'
const samples = []
const quantile = (xs, q) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * q) - 1]
try {
  for (let round = 0; round < 3; round++) {
    const p = await open({ tabs: 20, content: '# 写作 Writing\n\n中文与 English 混排。\n' })
    await p.waitForFunction(() => document.querySelectorAll('[role=tab]').length === 20, null, {
      polling: 20,
    })
    const tabs = p.getByRole('tab')
    for (let i = 0; i < 20; i++) {
      await tabs.nth(i).click()
      await p.locator('.document-panel:not([hidden]) .ProseMirror').waitFor()
    }
    await p.evaluate(() => {
      document.addEventListener(
        'click',
        (e) => {
          if (e.target.closest('[role=tab]')) window.__switchStart = performance.now()
        },
        true,
      )
    })
    for (const scenario of ['recent-pair', 'old-tab'])
      for (let i = 0; i < 10; i++) {
        if (scenario === 'old-tab') for (const j of [4, 9, 14, 19]) await tabs.nth(j).click()
        const target = scenario === 'recent-pair' ? i % 2 : 0
        await tabs.nth(target).click()
        const editor = p.locator('.document-panel:not([hidden]) .ProseMirror')
        await editor.waitFor()
        const before = await editor.textContent()
        await editor.click()
        await p.keyboard.insertText('校验')
        const result = await p.evaluate(() => {
          const panel = document.querySelector('.document-panel:not([hidden])')
          const el = panel.querySelector('.ProseMirror')
          return {
            ms: performance.now() - window.__switchStart,
            accepted: el.textContent.includes('校验'),
            wrong: [...document.querySelectorAll('.document-panel[hidden] .ProseMirror')].some(
              (el) => el.textContent.includes('校验'),
            ),
            focused: el === document.activeElement,
          }
        })
        assert(result.accepted && !result.wrong && result.focused)
        await p.keyboard.press('Meta+z')
        assert.equal(await editor.textContent(), before)
        samples.push({ round, scenario, ...result })
      }
    await p.close()
  }
  const summary = ['recent-pair', 'old-tab'].map((scenario) => {
    const rows = samples.filter((s) => s.scenario === scenario)
    const p95s = [0, 1, 2].map((r) =>
      quantile(
        rows.filter((s) => s.round === r).map((s) => s.ms),
        0.95,
      ),
    )
    return {
      scenario,
      p50: quantile(
        rows.map((s) => s.ms),
        0.5,
      ),
      p95: quantile(
        rows.map((s) => s.ms),
        0.95,
      ),
      roundP95: p95s,
      allowedIncrementMs: Math.max(16.7, Math.max(...p95s) - Math.min(...p95s)),
    }
  })
  await writeFile(
    `${output}/switching.json`,
    JSON.stringify(
      {
        boundary:
          'Vite development / simulated IPC; trusted browser tab click to successful test input after explicit editor click; includes automation scheduling and focus click; not native switching signoff',
        blankFrameVerification: 'not measured; editor visibility does not prove pixel continuity',
        samples,
        summary,
        policy:
          'Freeze allowedIncrementMs=max(one 60Hz frame, range of the three baseline P95s) before candidate; any wrong-tab input, undo loss or failed input rejects eviction.',
      },
      null,
      2,
    ),
  )
  console.log('PASS:', samples.length, 'switch/accepted-input/undo samples')
} finally {
  await browser.close()
}

import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, output, errors } from './browserHarness.mjs'
import { samples as sources, describeSample } from './performanceSamples.mjs'
const results = []
async function measure(page, scenario) {
  const result = await page.evaluate(() => ({
    editors: document.querySelectorAll('.ProseMirror').length,
    elements: document.querySelectorAll('*').length,
    menus: document.querySelectorAll('.code-block-card__language-menu').length,
    listeners: window.__miloListenerCounts?.(),
    metrics: window.__miloMetrics,
    openProfiles: window.__miloOutlineTest?.profiles,
  }))
  results.push({ scenario, ...result })
  return result
}
try {
  const home = await open({ home: true, instrument: true })
  assert.equal((await measure(home, 'home')).editors, 0)
  await home.close()
  for (const [name, content] of Object.entries(sources)) {
    const start = performance.now()
    let page
    try {
      page = await open({ content, instrument: true })
      const readyMs = performance.now() - start
      const metric = await measure(page, name)
      Object.assign(results.at(-1), { readyMs, fixture: describeSample(name, content) })
      if (name === 'code') {
        assert.equal(metric.menus, 0)
        assert.equal(await page.locator('.code-block-card').count(), 300)
      }
      if (name === 'plain-1mb') {
        const sourceStart = performance.now()
        await page.getByRole('button', { name: '源码', exact: true }).click()
        const source = page.locator('.source-editor textarea')
        await source.waitFor()
        assert.equal(await source.inputValue(), content)
        const sourceReadyMs = performance.now() - sourceStart
        await source.evaluate((field) =>
          field.setSelectionRange(field.value.length, field.value.length),
        )
        await page.keyboard.type(' synthetic source edit')
        await page.keyboard.press('Meta+s')
        await page.waitForFunction(() =>
          window.__miloOutlineTest.writes.some((w) =>
            w.markdown.endsWith(' synthetic source edit'),
          ),
        )
        await measure(page, 'plain-1mb-source-edited-saved')
        Object.assign(results.at(-1), { sourceReadyMs })
      }
      await page.close()
    } catch (error) {
      results.push({
        scenario: name,
        status: 'failed-or-timeout',
        error: String(error),
        elapsedMs: performance.now() - start,
      })
      await page?.close()
      // A timed-out page must not keep consuming CPU during later samples.
      for (const context of browser.contexts()) await context.close()
    }
  }
  for (const count of [1, 5, 10, 20]) {
    const page = await open({ tabs: count, instrument: true })
    await page.waitForTimeout(600)
    assert.equal((await measure(page, `tabs-${count}-restored`)).editors, 1)
    const tabs = page.getByRole('tab')
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click()
      await page
        .locator('.document-panel:not([hidden]) .milkdown-editor[aria-busy="false"]')
        .waitFor()
    }
    assert.equal((await measure(page, `tabs-${count}-visited`)).editors, count)
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click()
      await page.locator('.document-panel:not([hidden]) .ProseMirror p').first().click()
      await page.keyboard.type(` synthetic edit ${i}`)
    }
    await page.waitForTimeout(1800)
    await measure(page, `tabs-${count}-edited`)
    for (let i = 0; i < count; i++) {
      await page.getByRole('tab').first().focus()
      await page.keyboard.press('Enter')
      await page.waitForFunction(
        () => document.querySelector('[role=tab]')?.getAttribute('aria-selected') === 'true',
      )
      await page.locator('.document-tab--active .document-tab__close').click()
      await page.waitForFunction(
        (expected) =>
          document.querySelectorAll('[role=tab]').length === expected ||
          document.querySelector('[role=alertdialog], [role=dialog]'),
        count - i - 1,
      )
      if (await page.getByRole('button', { name: '保存并关闭', exact: true }).isVisible())
        await page.getByRole('button', { name: '保存并关闭', exact: true }).click()
      await page
        .waitForFunction(
          (expected) => document.querySelectorAll('[role=tab]').length === expected,
          count - i - 1,
        )
        .catch(async (error) => {
          await page.screenshot({ path: `${output}/resource-close-failure.png` })
          console.log(await page.locator('body').innerText())
          throw error
        })
    }
    await page.locator('.document-empty-state').waitFor()
    assert.equal((await measure(page, `tabs-${count}-closed`)).editors, 0)
    await page.close()
  }
} finally {
  await writeFile(
    `${output}/resources.json`,
    JSON.stringify(
      {
        mode: 'Vite development; Chromium; simulated native IPC; counts are retained resources, not proof of a leak or process memory',
        engine: browser.version(),
        results,
      },
      null,
      2,
    ) + '\n',
  )
  await browser.close()
}
assert.deepEqual(errors, [])
assert.equal(
  results.filter((r) => r.status).length,
  0,
  'Resource failures/timeouts recorded in resources.json',
)
console.log(
  `Resource samples: ${results.length}; failures/timeouts: ${results.filter((r) => r.status).length}`,
)

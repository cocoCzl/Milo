import { writeFile } from 'node:fs/promises'
import { open, browser, output } from './browserHarness.mjs'
import { samples } from './performanceSamples.mjs'
const results = []
try {
  const p = await open({ content: '# Lab' })
  await p.getByRole('button', { name: '源码', exact: true }).click()
  const field = p.locator('.source-editor textarea')
  await field.waitFor()
  for (const variant of [
    'original',
    'wrap-off',
    'no-ligatures',
    'fixed-font',
    'no-prewrap',
    'repeat-control',
  ]) {
    await p.reload()
    await p.locator('.ProseMirror').waitFor()
    await p.getByRole('button', { name: '源码', exact: true }).click()
    await p.locator('.source-editor textarea').evaluate(
      (el, { content, variant }) => {
        el.value = content
        el.dispatchEvent(new Event('input', { bubbles: true }))
        if (variant === 'wrap-off') el.wrap = 'off'
        if (variant === 'no-ligatures') el.style.fontVariantLigatures = 'none'
        if (variant === 'fixed-font') el.style.fontFamily = 'Arial'
        if (variant === 'no-prewrap') el.style.whiteSpace = 'pre'
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
        window.__times = []
        let t
        el.addEventListener('beforeinput', () => (t = performance.now()))
        el.addEventListener('input', () =>
          queueMicrotask(() => window.__times.push(performance.now() - t)),
        )
      },
      { content: samples['structured-1mb'], variant },
    )
    for (let i = 0; i < 10; i++) await p.keyboard.insertText('x')
    const times = await p.evaluate(() => window.__times)
    results.push({ variant, times })
    console.log(variant, times)
  }
  await writeFile(`${output}/variants.json`, JSON.stringify(results, null, 2))
  await p.close()
} finally {
  await browser.close()
}

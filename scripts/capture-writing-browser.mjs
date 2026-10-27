import { open, browser, output, settle } from './browserHarness.mjs'
try {
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ]) {
    for (const theme of ['light', 'dark', 'warm']) {
      const page = await open({ width, height, theme, sidebar: true })
      await page.screenshot({ path: `${output}/writing-${width}-${theme}.png` })
      await page.evaluate(() => window.__miloOutlineTest.command('toggle-focus-mode'))
      await settle(page)
      await page.screenshot({ path: `${output}/focus-${width}-${theme}.png` })
      await page.close()
    }
  }
} finally {
  await browser.close()
}

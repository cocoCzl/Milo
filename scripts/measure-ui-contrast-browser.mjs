// Sample final computed colors, including translucent backgrounds and ancestor
// opacity. This checks selected controls; VoiceOver and visual preference are
// separate human acceptance items. No claim is made about all syntax tokens.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, output } from './browserHarness.mjs'
const samples = []
try {
  for (const theme of ['light', 'dark', 'warm']) {
    const page = await open({
      theme,
      folder: '/test',
      content:
        '# 三主题对比\n\n中文正文 English。\n\n```typescript\nconst message = "写作";\n```\n',
    })
    async function measure(selector, kind = 'text') {
      const element = page.locator(selector).first()
      await element.waitFor({ state: 'visible' })
      samples.push(
        await element.evaluate(
          (el, { theme, selector, kind }) => {
            const canvas = document.createElement('canvas').getContext('2d')
            const rgba = (css) => {
              canvas.clearRect(0, 0, 1, 1)
              canvas.fillStyle = css
              canvas.fillRect(0, 0, 1, 1)
              const p = [...canvas.getImageData(0, 0, 1, 1).data]
              return [p[0], p[1], p[2], p[3] / 255]
            }
            const over = (front, back) => {
              const a = front[3] + back[3] * (1 - front[3])
              return a
                ? [0, 1, 2]
                    .map((i) => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / a)
                    .concat(a)
                : [0, 0, 0, 0]
            }
            const paint = (foreground) => {
              let pixel = foreground
              for (let node = el; node; node = node.parentElement) {
                const style = getComputedStyle(node)
                pixel = over(pixel, rgba(style.backgroundColor))
                pixel[3] *= Number(style.opacity)
              }
              return over(pixel, [255, 255, 255, 1])
            }
            const luminance = (rgb) =>
              rgb
                .slice(0, 3)
                .map((n) => {
                  const c = n / 255
                  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
                })
                .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
            const style = getComputedStyle(el)
            const css = kind === 'focus' ? style.getPropertyValue('--focus-ring') : style.color
            const fg = paint(rgba(css)),
              bg = paint([0, 0, 0, 0])
            const a = luminance(fg),
              b = luminance(bg)
            return {
              theme,
              selector,
              kind,
              css,
              foreground: fg,
              background: bg,
              ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              target: kind === 'text' ? 4.5 : 3,
            }
          },
          { theme, selector, kind },
        ),
      )
    }
    for (const selector of [
      '.document-tab [role="tab"]',
      '.document-context__status',
      '.mode-switch button[aria-pressed="true"]',
      '.mode-switch button[aria-pressed="false"]',
      '.ProseMirror p',
      '.code-block-card__language-trigger',
    ])
      await measure(selector)
    await measure('.application-bar__new-document', 'icon')
    await measure('.application-bar__new-document', 'focus')
    await page.keyboard.press('Meta+p')
    await page.getByRole('option').first().waitFor()
    await measure('[role="option"][aria-selected="true"] strong')
    await measure('[role="option"][aria-selected="true"] small')
    await measure('.quick-open input', 'focus')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '源码', exact: true }).click()
    await page.getByRole('textbox', { name: /Markdown 源码/ }).fill('# 合成保存失败\n\n正文保留')
    await page.evaluate(() => {
      window.__miloOutlineTest.writeError = true
    })
    await page.keyboard.press('Meta+s')
    await page.locator('.document-error').waitFor()
    await measure('.document-context__status')
    await measure('.document-error')
    await measure('.document-error button')
    await page.close()
  }
  await writeFile(`${output}/contrast.json`, JSON.stringify({ samples }, null, 2))
  const failures = samples.filter((sample) => sample.ratio < sample.target)
  console.log(JSON.stringify(failures, null, 2))
  assert.deepEqual(failures, [])
  console.log('PASS:', samples.length, 'computed foreground/background contrast samples')
} finally {
  await browser.close()
}

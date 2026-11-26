// Keyboard-only restoration scenarios; pointer actions only establish fixture carets.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, output, core } from './browserHarness.mjs'
const samples = []
try {
  const p = await open({ tabs: core ? 5 : 20, content: '# Target\n\nfirst body\n\nlast body' })
  for (let i = 0; i < (core ? 5 : 20); i++) {
    const tab = p.getByRole('tab').nth(i)
    const panelId = await tab.getAttribute('aria-controls')
    assert(panelId)
    await tab.click()
    const el = p.locator(
      `#${panelId}:not([hidden]) .milkdown-editor[aria-busy="false"] .ProseMirror`,
    )
    await el.waitFor()
    // Establish the fixture caret with a real pointer action. WebKit can
    // reconcile focus during an immediate Meta+Down / ArrowLeft sequence and
    // lose a movement before these tab-restoration scenarios even begin.
    // Locate the fourth character geometrically; never assign the DOM/model
    // selection, refocus, or retry input in the keyboard-only scenarios below.
    const paragraph = el.locator(':scope > p').last()
    const point = await paragraph.evaluate((element) => {
      const range = document.createRange()
      range.setStart(element.firstChild, 3)
      range.setEnd(element.firstChild, 4)
      const character = range.getBoundingClientRect()
      const bounds = element.getBoundingClientRect()
      return {
        x: character.left - bounds.left + Math.min(1, character.width / 4),
        y: character.top - bounds.top + character.height / 2,
      }
    })
    await paragraph.click({ position: point })
    assert.deepEqual(
      await p.evaluate(() => ({
        text: getSelection().anchorNode.textContent,
        offset: getSelection().anchorOffset,
      })),
      { text: 'last body', offset: 3 },
    )
  }
  for (let round = 0; round < (core ? 1 : 3); round++)
    for (const scenario of ['recent-pair', 'old-tab', 'rapid-aba'])
      for (let n = 0; n < (core ? 2 : 10); n++) {
        if (scenario === 'old-tab')
          for (let j = 0; j < (core ? 4 : 19); j++) await p.keyboard.press('Control+Tab')
        const previous = await p
          .locator('[role=tab][aria-selected=true]')
          .getAttribute('aria-controls')
        if (scenario === 'rapid-aba') {
          await p.keyboard.press('Control+Tab')
          await p.keyboard.press('Control+Shift+Tab')
        } else
          await p.keyboard.press(
            scenario === 'recent-pair' && n % 2 ? 'Control+Shift+Tab' : 'Control+Tab',
          )
        const marker = `zx${round}${scenario[0]}${n}zx`
        await p.keyboard.type(marker)
        const result = await p.evaluate((marker) => {
          const panel = document.querySelector('.document-panel:not([hidden])'),
            el = panel.querySelector('.ProseMirror')
          return {
            panel: panel.id,
            focused: document.activeElement === el,
            correctCaret: el.textContent.includes(`las${marker}t body`),
            wrong: [...document.querySelectorAll('.document-panel[hidden]')].some((x) =>
              x.textContent.includes(marker),
            ),
          }
        }, marker)
        assert(result.focused && result.correctCaret && !result.wrong, JSON.stringify(result))
        if (scenario === 'rapid-aba') assert.equal(result.panel, previous)
        await p.keyboard.press('Meta+z')
        assert.equal(
          await p.locator('.document-panel:not([hidden]) .ProseMirror').textContent(),
          'Targetfirst bodylast body',
        )
        samples.push({ round, scenario, n, ...result })
      }
  // Arrow-based tab navigation must keep focus on the tab, rather than stealing it.
  await p.getByRole('tab').nth(0).focus()
  await p.keyboard.press('ArrowRight')
  assert.equal(
    await p
      .locator('[role=tab][aria-selected=true]')
      .evaluate((el) => document.activeElement === el),
    true,
  )
  await p.close()
  await writeFile(`${output}/tab-input.json`, JSON.stringify({ samples }, null, 2))
  console.log('PASS', samples.length, 'keyboard-only target/caret/undo samples')
} finally {
  await browser.close()
}

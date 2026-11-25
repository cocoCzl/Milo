import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, errors, output, core, settle } from './browserHarness.mjs'

const records = []
const content =
  '# 把想法留在纸上\n\n清晨的街道还很安静。打开昨天的笔记，从未写完的那一句继续。\n\n## 今天的安排\n\n- 留出一段不被打扰的写作时间\n- 整理零散的想法，保留值得展开的细节\n\n> 好的工具让注意力回到文字本身。'
try {
  for (const theme of core ? ['light'] : ['light', 'dark', 'warm']) {
    for (const [width, height] of [
      [1280, 820],
      [720, 520],
    ]) {
      for (const uiZoom of core ? [140] : [100, 140]) {
        for (const tabs of core ? [0, 5] : [0, 1, 5]) {
          const page = await open({
            width,
            height,
            theme,
            uiZoom,
            home: tabs === 0,
            tabs,
            sidebar: true,
            folder: '/test',
            content,
          })
          const bar = page.locator('.application-bar')
          const metrics = await page.evaluate(() => {
            const bar = document.querySelector('.application-bar').getBoundingClientRect()
            return {
              height: bar.height,
              overflow: document.documentElement.scrollWidth > innerWidth,
              controls: [...document.querySelectorAll('.application-bar button')]
                .filter((el) => el.getBoundingClientRect().width)
                .map((el) => {
                  const r = el.getBoundingClientRect()
                  return {
                    label: el.getAttribute('aria-label') || el.textContent,
                    left: r.left,
                    right: r.right,
                    top: r.top,
                    bottom: r.bottom,
                  }
                }),
            }
          })
          assert(!metrics.overflow, 'page must not scroll horizontally')
          for (const control of metrics.controls.filter(
            (c) => !c.label.startsWith('关闭 ') && !c.label.includes('tab-'),
          )) {
            // Horizontally scrollable document tabs are intentionally clipped by their strip.
            if (control.label.includes('outline-long')) continue
            assert(
              control.left >= 0 && control.right <= width + 1,
              `offscreen control ${control.label}`,
            )
          }
          if (!tabs) {
            assert.equal(await page.getByRole('tablist').count(), 0)
            assert.equal(await bar.getByRole('button', { name: '进入专注模式' }).count(), 0)
            assert.equal(
              await bar.getByRole('button', { name: '新建文档' }).innerText(),
              '新建文档',
            )
            assert(await bar.getByRole('button', { name: /侧边栏/ }).isVisible())
            if (uiZoom === 100)
              assert(metrics.height >= 40 && metrics.height <= 44, `home height ${metrics.height}`)
          } else {
            assert.equal(await page.getByRole('tab').count(), tabs)
            await page.getByRole('tab', { selected: true }).press('End')
            await page.getByRole('tab', { selected: true }).press('Home')
            assert.equal(await page.getByRole('tab').first().getAttribute('aria-selected'), 'true')
          }
          if (width === 1280 && tabs === 0 && uiZoom === 100)
            await page.screenshot({ path: `${output}/after-${theme}-home.png` })
          if (width === 720 && uiZoom === 140 && tabs === 5)
            await page.screenshot({ path: `${output}/after-${theme}-narrow.png` })
          if (width === 720 && uiZoom === 140 && tabs === 0) {
            const more = bar.getByRole('button', { name: '更多操作', exact: true })
            await more.press('ArrowDown')
            const bounds = await page.getByRole('menu').boundingBox()
            assert(
              bounds.x >= 0 &&
                bounds.x + bounds.width <= width &&
                bounds.y + bounds.height <= height,
            )
            await page.getByRole('menu').press('End')
            await page.getByRole('menu').press('Escape')
            assert(await more.evaluate((el) => el === document.activeElement))
          }
          records.push({ theme, width, height, uiZoom, tabs, barHeight: metrics.height })
          await page.close()
        }
      }
    }
  }
  for (const locale of ['zh-CN', 'en']) {
    const p = await open({ home: true, sidebar: true, locale })
    await p
      .getByRole('button', { name: locale === 'en' ? 'Choose folder…' : '选择文件夹…' })
      .waitFor()
    assert.equal(
      await p
        .getByRole('button', {
          name: locale === 'en' ? 'Clear recent records' : '清空最近使用记录',
        })
        .count(),
      0,
    )
    await p.close()
  }
  const longFolder = await open({
    home: true,
    sidebar: true,
    folder: '/test/这是一个很长很长的文件夹名称用于布局测试',
  })
  assert(
    await longFolder
      .locator('.file-sidebar__workspace-row strong')
      .evaluate((el) => el.scrollWidth > el.clientWidth && el.title.includes('这是一个很长')),
  )
  await longFolder.close()
  const p = await open({ sidebar: true, folder: '/test', content })
  await p.evaluate(() => {
    const t = window.__miloOutlineTest
    t.pageFailed = false
    t.subFailed = false
    const file = (path) => ({
      path,
      name: path.split('/').at(-1),
      isDirectory: false,
      children: [],
    })
    const dir = (path, children = [], nextOffset = null) => ({
      path,
      name: path.split('/').at(-1),
      isDirectory: true,
      children,
      nextOffset,
    })
    t.browse = ({ path, excludedNames, offset }) => {
      const showExcluded = Array.isArray(excludedNames) && excludedNames.length === 0
      if (path === '/test')
        return dir(path, [
          dir('/test/写作笔记'),
          file('/test/outline-long.md'),
          file('/test/这是一个很长很长的文件名用于检查自然省略.md'),
          ...(showExcluded ? [dir('/test/node_modules')] : []),
        ])
      if (!t.subFailed) throw Error('Synthetic permission denied')
      if (offset === 200) {
        if (!t.pageFailed) throw Error('Synthetic page failure')
        return dir(path, [file(path + '/最后一篇.md')])
      }
      return dir(path, [file(path + '/第一篇.md'), dir(path + '/多层目录')], 200)
    }
  })
  await p.getByRole('button', { name: '刷新文件夹', exact: true }).click()
  const sub = p.getByRole('button', { name: '写作笔记', exact: true })
  await sub.click()
  await p.getByRole('alert').filter({ hasText: 'permission denied' }).waitFor()
  await p.evaluate(() => {
    window.__miloOutlineTest.subFailed = true
  })
  await p.getByRole('button', { name: '重试', exact: true }).click()
  await p.getByRole('button', { name: '第一篇.md', exact: true }).waitFor()
  await p.getByRole('button', { name: '加载更多…', exact: true }).click()
  await p.getByRole('alert').filter({ hasText: 'page failure' }).waitFor()
  await p.evaluate(() => {
    window.__miloOutlineTest.pageFailed = true
  })
  await p.getByRole('button', { name: '重试', exact: true }).click()
  await p.getByRole('button', { name: '最后一篇.md', exact: true }).waitFor()
  assert(await p.getByRole('button', { name: '第一篇.md', exact: true }).isVisible())
  await p.getByRole('button', { name: '刷新文件夹', exact: true }).click()
  assert.equal(await sub.getAttribute('aria-expanded'), 'true')
  const menu = p.getByRole('button', { name: '文件夹更多操作', exact: true })
  await menu.press('ArrowDown')
  assert.equal(await p.getByRole('menuitemcheckbox').getAttribute('aria-checked'), 'false')
  await p.getByRole('menuitem', { name: '更换文件夹…' }).press('ArrowDown')
  await p.getByRole('menuitemcheckbox').press('Escape')
  assert(await menu.evaluate((el) => el === document.activeElement))
  await menu.click()
  await p.getByRole('menuitemcheckbox').click()
  await p.getByRole('button', { name: 'node_modules', exact: true }).waitFor()
  assert(await menu.evaluate((el) => el === document.activeElement))
  await menu.click()
  assert.equal(await p.getByRole('menuitemcheckbox').getAttribute('aria-checked'), 'true')
  await p.screenshot({ path: `${output}/after-folder-menu.png` })
  await p.getByRole('menuitemcheckbox').press('Escape')
  const before = await p.locator('.file-sidebar__recent details').getAttribute('open')
  await p.getByRole('button', { name: '清空最近使用记录', exact: true }).click()
  assert.equal(await p.locator('.file-sidebar__recent details').getAttribute('open'), before)
  await p.keyboard.press('Tab')
  await p.getByRole('button', { name: '刷新文件夹', exact: true }).focus()
  await p.getByRole('tooltip', { name: '刷新文件夹', exact: true }).waitFor()
  await p.close()
  const statePage = await open({ sidebar: true, folder: '/test', height: 520 })
  await statePage.evaluate(() => {
    const t = window.__miloOutlineTest
    t.browse = ({ path, excludedNames, offset, snapshotId }) => {
      const file = (name) => ({ path: `${path}/${name}`, name, isDirectory: false, children: [] })
      const dir = (name) => ({ ...file(name), isDirectory: true })
      const token = path + (excludedNames?.length === 0 ? '-all' : '-filtered')
      if (offset) {
        if (snapshotId !== token) throw Error('DIRECTORY_SNAPSHOT_STALE: wrong token')
        return {
          path,
          name: path.split('/').at(-1),
          isDirectory: true,
          children: [file('last-page.md')],
          nextOffset: null,
          snapshotId: token,
        }
      }
      return {
        path,
        name: path.split('/').at(-1),
        isDirectory: true,
        children:
          path === '/test'
            ? [
                ...(excludedNames?.length === 0 ? [dir('node_modules')] : []),
                ...Array.from({ length: 200 }, (_, i) => file(`entry-${i}.md`)),
              ]
            : [file('inside.md')],
        nextOffset: path === '/test' ? 200 : null,
        snapshotId: token,
      }
    }
  })
  await statePage.getByRole('button', { name: '刷新文件夹', exact: true }).click()
  await statePage.getByRole('button', { name: 'entry-0.md', exact: true }).waitFor()
  const settingsWrites = () =>
    statePage.evaluate(
      () =>
        window.__miloOutlineTest.commands.filter((x) => x === 'save_application_settings').length,
    )
  const writesBefore = await settingsWrites()
  await statePage.getByRole('button', { name: '文件夹更多操作' }).click()
  await statePage.getByRole('menuitemcheckbox').click()
  await statePage.getByRole('button', { name: 'node_modules', exact: true }).click()
  await statePage.getByRole('button', { name: 'inside.md', exact: true }).waitFor()
  await statePage.getByRole('button', { name: '加载更多…', exact: true }).click()
  await statePage.getByRole('button', { name: 'last-page.md', exact: true }).waitFor()
  await statePage.locator('.file-sidebar__body').evaluate((el) => {
    el.scrollTop = 800
  })
  await settle(statePage)
  const scroll = await statePage.locator('.file-sidebar__body').evaluate((el) => el.scrollTop)
  assert(scroll > 0)
  assert.equal(await settingsWrites(), writesBefore, 'browsing state must not write settings')
  const calls = await statePage.evaluate(() => window.__miloOutlineTest.browseCalls.length)
  await statePage.getByRole('button', { name: '隐藏侧边栏', exact: true }).click()
  assert.equal(await statePage.locator('.file-sidebar').count(), 0, 'hidden tree must unmount')
  await statePage.getByRole('button', { name: '显示侧边栏', exact: true }).click()
  assert.equal(
    await statePage.locator('.file-sidebar__body').evaluate((el) => el.scrollTop),
    scroll,
  )
  assert.equal(
    await statePage
      .getByRole('button', { name: 'node_modules', exact: true })
      .getAttribute('aria-expanded'),
    'true',
  )
  assert(await statePage.getByRole('button', { name: 'last-page.md', exact: true }).isVisible())
  assert.equal(await statePage.evaluate(() => window.__miloOutlineTest.browseCalls.length), calls)
  await statePage.getByRole('button', { name: '文件夹更多操作' }).click()
  assert.equal(await statePage.getByRole('menuitemcheckbox').getAttribute('aria-checked'), 'true')
  await statePage.getByRole('menu').press('Escape')
  await statePage.locator('.file-sidebar__body').evaluate((el) => {
    el.scrollTop = 800
  })
  await settle(statePage)
  await statePage.evaluate(() => {
    window.__miloOutlineTest.pickedFolder = '/other'
  })
  await statePage.locator('.application-bar').getByRole('button', { name: '更多操作' }).click()
  await statePage.getByRole('menuitem', { name: '打开文件夹…' }).click()
  await statePage
    .locator('.file-sidebar__workspace-row strong')
    .filter({ hasText: 'other' })
    .waitFor()
  await statePage.getByRole('button', { name: '文件夹更多操作' }).click()
  assert.equal(await statePage.getByRole('menuitemcheckbox').getAttribute('aria-checked'), 'false')
  await statePage.getByRole('menu').press('Escape')
  await statePage.evaluate(() => {
    window.__miloOutlineTest.pickedFolder = '/test'
  })
  await statePage.locator('.application-bar').getByRole('button', { name: '更多操作' }).click()
  await statePage.getByRole('menuitem', { name: '打开文件夹…' }).click()
  await statePage.getByRole('button', { name: 'last-page.md', exact: true }).waitFor()
  assert.equal(
    await statePage
      .getByRole('button', { name: 'node_modules', exact: true })
      .getAttribute('aria-expanded'),
    'true',
  )
  assert.equal(
    await statePage.locator('.file-sidebar__body').evaluate((el) => el.scrollTop),
    scroll,
  )
  const beforeLocale = await statePage.evaluate(() => window.__miloOutlineTest.browseCalls.length)
  await statePage.getByRole('button', { name: '更多操作', exact: true }).click()
  await statePage.getByRole('menuitem', { name: '设置…', exact: true }).click()
  await statePage.getByRole('combobox', { name: '语言', exact: true }).click()
  await statePage.getByRole('option', { name: 'English', exact: true }).click()
  await statePage.getByRole('button', { name: 'Close preferences', exact: true }).click()
  assert(await statePage.getByRole('button', { name: 'last-page.md', exact: true }).isVisible())
  assert.equal(
    await statePage.evaluate(() => window.__miloOutlineTest.browseCalls.length),
    beforeLocale,
  )
  await statePage.close()
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/sidebar-toolbar-results.json`,
    JSON.stringify(
      {
        engine: process.env.MILO_BROWSER || 'chromium',
        sourceType: 'browser simulated IPC',
        records,
        folderInteractions: true,
        errors,
      },
      null,
      2,
    ),
  )
  console.log(
    `Passed ${records.length} layout cases, bilingual empty folder, folder menu/refresh/filter/paging/error/focus/tooltip and unmounted-state restoration checks`,
  )
} finally {
  await browser.close()
}

// Shared real App/Milkdown harness. Only native IPC is stubbed; no user files or preferences are touched.
import { mkdir, readFile, writeFile } from 'node:fs/promises'

import { chromium } from 'playwright'
const output = process.env.MILO_OUTLINE_ARTIFACTS || '/private/tmp/milo-outline-regression'
const url = process.env.MILO_TEST_URL || 'http://127.0.0.1:1420'
const markdown = await readFile(
  new URL('../tests/fixtures/outline-long.md', import.meta.url),
  'utf8',
)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = []

async function settle(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}

async function open({
  width = 1440,
  height = 900,
  theme = 'light',
  uiZoom = 100,
  docZoom = 100,
  sidebar = false,
  content = markdown,
  home = false,
  tabs = 1,
} = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('pageerror', (error) => {
    errors.push(error.message)
    console.error(error.stack)
  })
  await page.addInitScript(
    ({ content, theme, uiZoom, docZoom, sidebar, home, tabs }) => {
      const callbacks = new Map()
      const listeners = new Map()
      const files = new Map([
        ['/test/outline-long.md', content],
        ['/test/short.md', '# 短文档\n\n短文档正文。'],
      ])
      for (let i = 2; i <= tabs; i++) files.set(`/test/tab-${i}.md`, content)
      const paths = [...files.keys()].filter((path) => path !== '/test/short.md')
      let id = 0
      const test = {
        writes: [],
        command: (payload) => emit('milo://command', payload),
        open: (payload) => emit('milo://open-file', payload),
      }
      function emit(event, payload) {
        for (const [eventId, listener] of listeners) {
          if (listener.event === event)
            callbacks.get(listener.handler)?.({ event, id: eventId, payload })
        }
      }
      window.__miloOutlineTest = test
      window.isTauri = true
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener(_event, eventId) {
          listeners.delete(eventId)
        },
      }
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback(fn) {
          callbacks.set(++id, fn)
          return id
        },
        unregisterCallback(callbackId) {
          callbacks.delete(callbackId)
        },
        async invoke(cmd, args = {}) {
          if (cmd === 'load_application_settings')
            return {
              settingsVersion: 5,
              appearance: theme,
              locale: 'zh-CN',
              documentZoom: docZoom,
              interfaceZoom: uiZoom,
              documentFontStyle: 'sans',
              readingWidth: 'standard',
              lineHeight: 'standard',
              currentFolder: null,
              recentFiles: [],
              recentFolders: [],
              sidebarVisible: sidebar,
              sidebarWidth: 224,
              startupSession: {
                activeDocumentPath: home ? null : '/test/outline-long.md',
                openDocumentPaths: home ? [] : paths,
              },
            }
          if (cmd === 'read_draft_recovery') return { drafts: [], errors: [] }
          if (
            cmd === 'write_draft_recovery' ||
            cmd === 'close_coordinator_ready' ||
            cmd === 'cancel_close' ||
            cmd === 'complete_close'
          )
            return null
          if (cmd === 'save_application_settings') return args.settings
          if (cmd === 'read_markdown_document')
            return {
              path: args.path,
              markdown: files.get(args.path),
              hasBom: false,
              lineEnding: 'lf',
            }
          if (cmd.startsWith('write_markdown_document')) {
            files.set(args.request.path, args.request.markdown)
            test.writes.push(args.request)
            return args.request
          }
          if (cmd === 'plugin:event|listen') {
            listeners.set(++id, args)
            return id
          }
          if (
            cmd === 'plugin:event|unlisten' ||
            cmd === 'plugin:resources|close' ||
            cmd === 'recover_markdown_document_safe_v2'
          )
            return null
          if (cmd === 'plugin:fs|watch') return ++id
          if (cmd === 'initial_launch_markdown_file') return null
          throw new Error(`Unexpected test IPC: ${cmd}`)
        },
      }
    },
    { content, theme, uiZoom, docZoom, sidebar, home, tabs },
  )
  await page.goto(url)
  try {
    await page
      .locator(home ? '.document-empty-state' : '.milkdown-editor[aria-busy="false"] .ProseMirror')
      .first()
      .waitFor({ timeout: 60000 })
  } catch (reason) {
    await page.screenshot({ path: `${output}/failed-open.png` })
    console.error(await page.locator('body').innerText())
    throw reason
  }
  await settle(page)
  return page
}

export { open, settle, browser, errors, output, markdown }

import { expect, it } from 'vitest'
import { SidebarStateStore, directoryRootPreview } from './sidebarState'
import type { MarkdownTreeNode } from '../file-system/nativeMarkdownFile'
const page = (path: string, children: MarkdownTreeNode[] = []): MarkdownTreeNode => ({
  path,
  name: path,
  children,
  isDirectory: true,
  snapshotId: 'original',
  nextOffset: 200,
})
it('bounds remembered folders and page payloads independently of navigation preferences', () => {
  const store = new SidebarStateStore(2, 2)
  const a = store.folder('/a')
  a.showExcluded = true
  a.scrollTop = 180
  store.expand(a, '/a/sub', true)
  store.remember(a, '/a', true, {
    page: page('/a', [page('1'), page('2')]),
    error: null,
    failedOffset: null,
  })
  const b = store.folder('/b')
  store.remember(b, '/b', false, { page: page('/b', [page('3')]), error: null, failedOffset: null })
  expect(store.listing(a, '/a', true)).toBeUndefined()
  expect(store.folder('/a')).toBe(a)
  expect(a.showExcluded).toBe(true)
  expect(a.expanded.get('/a/sub')).toBe(true)
  expect(a.scrollTop).toBe(180)
  store.folder('/c')
  expect(store.folder('/b')).not.toBe(b)
})
it('drops oversized strings and bounds expanded paths while retaining ordinary preferences', () => {
  const store = new SidebarStateStore()
  const state = store.folder('/a')
  for (let i = 0; i < 520; i++) store.expand(state, `/a/${i}`, true)
  expect(state.expanded.size).toBe(512)
  store.remember(state, '/a', false, {
    page: page('x'.repeat(3 * 1024 * 1024)),
    error: null,
    failedOffset: null,
  })
  expect(store.listing(state, '/a', false)).toBeUndefined()
})

it('does not pin merged pagination outside the bounded session cache', () => {
  const full = page(
    '/root',
    Array.from({ length: 450 }, (_, i) => page(String(i))),
  )
  const preview = directoryRootPreview(full)
  expect(preview.children).toHaveLength(200)
  expect(preview.nextOffset).toBe(200)
  expect(preview.snapshotId).toBe(full.snapshotId)
  expect(full.children).toHaveLength(450)
})

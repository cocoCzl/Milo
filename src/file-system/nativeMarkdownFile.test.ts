import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))

import { ensureMarkdownExtension, writeImageAsset, writeMarkdownFile } from './nativeMarkdownFile'

describe('ensureMarkdownExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves Markdown extensions and adds .md when a save path has none', () => {
    expect(ensureMarkdownExtension('/notes/ideas.md')).toBe('/notes/ideas.md')
    expect(ensureMarkdownExtension('/notes/ideas.MARKDOWN')).toBe('/notes/ideas.MARKDOWN')
    expect(ensureMarkdownExtension('/notes/ideas')).toBe('/notes/ideas.md')
  })

  it('wraps native write requests in the Rust command argument name', async () => {
    const document = { path: '/notes/ideas.md', markdown: '# Ideas', lineEnding: 'lf' as const, hasBom: false }
    const image = { bytes: [137, 80], mimeType: 'image/png' }

    await writeMarkdownFile(document)
    await writeImageAsset(document.path, image)

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'write_markdown_document', { request: document })
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'write_image_asset', {
      request: { documentPath: document.path, ...image },
    })
  })
})

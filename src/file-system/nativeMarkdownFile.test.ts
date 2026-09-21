import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))

import {
  ensureMarkdownExtension,
  recoverAndReadMarkdownFile,
  writeImageAsset,
  writeMarkdownFile,
  writeMarkdownFileSafely,
} from './nativeMarkdownFile'

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

  it('recovers an ordinary macOS document before reading and sends its expected disk version to safe save', async () => {
    const expected = { path: '/notes/ordinary.md', markdown: '# Before', lineEnding: 'lf' as const, hasBom: false }
    const next = { ...expected, markdown: '# After' }
    mocks.invoke
      .mockResolvedValueOnce('Clean')
      .mockResolvedValueOnce(expected)
      .mockResolvedValueOnce(next)

    await recoverAndReadMarkdownFile(expected.path, true)
    await writeMarkdownFileSafely(next, expected)

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'recover_markdown_document_safe_v2', { path: expected.path })
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'read_markdown_document', { path: expected.path })
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, 'write_markdown_document_safe_v2', {
      request: {
        ...next,
        expectedMarkdown: expected.markdown,
        expectedLineEnding: expected.lineEnding,
        expectedHasBom: expected.hasBom,
      },
    })
  })

  it('requests create-new semantics for a new macOS document instead of falling back to atomic replace', async () => {
    const document = { path: '/notes/new.md', markdown: '# New', lineEnding: 'lf' as const, hasBom: false }
    mocks.invoke.mockResolvedValueOnce(document)

    await writeMarkdownFileSafely(document, null)

    expect(mocks.invoke).toHaveBeenCalledWith('write_markdown_document_safe_v2', {
      request: {
        ...document,
        expectedMarkdown: null,
        expectedLineEnding: null,
        expectedHasBom: null,
      },
    })
  })

  it('surfaces an unfinished recovery state as an explicit data-protection error', async () => {
    mocks.invoke.mockRejectedValueOnce('SAFE_SAVE_RECOVERY_BLOCKED[corrupt-marker]: invalid JSON')

    await expect(recoverAndReadMarkdownFile('/notes/corrupt.md', true)).rejects.toThrow(
      'Milo detected an unfinished file recovery state',
    )
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
  })
})

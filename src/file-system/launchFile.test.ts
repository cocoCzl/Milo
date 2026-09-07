import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))

import { initialLaunchMarkdownFile } from './launchFile'

describe('initial launch Markdown file', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not call the native boundary in a browser preview', async () => {
    mocks.isTauri.mockReturnValue(false)

    await expect(initialLaunchMarkdownFile()).resolves.toBeNull()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('asks the native app for the Finder-selected Markdown file', async () => {
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockResolvedValue('/Users/milo/Notes/welcome.md')

    await expect(initialLaunchMarkdownFile()).resolves.toBe('/Users/milo/Notes/welcome.md')
    expect(mocks.invoke).toHaveBeenCalledWith('initial_launch_markdown_file')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(),
  openUrl: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }))

import { isExternalHttpUrl, openExternalLink } from './externalLink'

describe('external links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isTauri.mockReturnValue(true)
    mocks.openUrl.mockResolvedValue(undefined)
  })

  it('only hands HTTP(S) links to the system opener', async () => {
    expect(isExternalHttpUrl('https://milo.example')).toBe(true)
    expect(isExternalHttpUrl('file:///private/note.md')).toBe(false)

    await openExternalLink('https://milo.example')
    await openExternalLink('javascript:alert(1)')

    expect(mocks.openUrl).toHaveBeenCalledOnce()
    expect(mocks.openUrl).toHaveBeenCalledWith('https://milo.example')
  })
})

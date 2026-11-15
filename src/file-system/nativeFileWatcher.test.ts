import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  close: vi.fn(),
  channels: [] as { onmessage: (e: { paths: string[] }) => void }[],
}))
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: mocks.invoke,
  Channel: class {
    constructor(public onmessage: (e: { paths: string[] }) => void) {
      mocks.channels.push(this)
    }
  },
  Resource: class {
    constructor(public rid: number) {}
    close() {
      return mocks.close(this.rid)
    }
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.channels.length = 0
  mocks.invoke.mockResolvedValue(11)
  mocks.close.mockResolvedValue(undefined)
})

it('shares concurrent registrations by parent and delivers only relevant file/rename events', async () => {
  const { watchMarkdownFile } = await import('./nativeFileWatcher')
  const a = vi.fn(),
    b = vi.fn(),
    other = vi.fn()
  const [stopA, stopB, stopOther] = await Promise.all([
    watchMarkdownFile('/notes/a.md', a),
    watchMarkdownFile('/notes/b.md', b),
    watchMarkdownFile('/other/a.md', other),
  ])
  expect(mocks.invoke).toHaveBeenCalledTimes(2)
  expect(mocks.invoke).toHaveBeenCalledWith(
    'plugin:fs|watch',
    expect.objectContaining({ paths: ['/notes'], options: { delayMs: 120, recursive: false } }),
  )
  mocks.channels[0].onmessage({ paths: ['/notes/a.md', '/notes/replaced.md'] })
  expect(a).toHaveBeenCalledOnce()
  expect(b).not.toHaveBeenCalled()
  expect(other).not.toHaveBeenCalled()
  await stopA()
  expect(mocks.close).not.toHaveBeenCalled()
  mocks.channels[0].onmessage({ paths: ['/notes'] })
  expect(a).toHaveBeenCalledOnce()
  expect(b).toHaveBeenCalledOnce()
  await stopB()
  await stopB()
  expect(mocks.close).toHaveBeenCalledTimes(1)
  await stopOther()
  expect(mocks.close).toHaveBeenCalledTimes(2)
})

it('removes a failed pending watch, retries, and keeps distinct subscribers for one file', async () => {
  const { watchMarkdownFile } = await import('./nativeFileWatcher')
  mocks.invoke.mockRejectedValueOnce(new Error('watch denied'))
  await expect(
    Promise.all([
      watchMarkdownFile('/notes/a.md', vi.fn()),
      watchMarkdownFile('/notes/b.md', vi.fn()),
    ]),
  ).rejects.toThrow('watch denied')
  const a = vi.fn(),
    b = vi.fn()
  const [stopA, stopB] = await Promise.all([
    watchMarkdownFile('/notes/a.md', a),
    watchMarkdownFile('/notes/a.md', b),
  ])
  expect(mocks.invoke).toHaveBeenCalledTimes(2)
  mocks.channels[1].onmessage({ paths: ['/notes/a.md'] })
  expect(a).toHaveBeenCalledOnce()
  expect(b).toHaveBeenCalledOnce()
  await stopA()
  mocks.channels[1].onmessage({ paths: ['/notes/a.md'] })
  expect(a).toHaveBeenCalledOnce()
  expect(b).toHaveBeenCalledTimes(2)
  await stopB()
  expect(mocks.close).toHaveBeenCalledOnce()
})

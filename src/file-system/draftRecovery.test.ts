import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }))
vi.mock('@tauri-apps/api/core', () => mocks)
import { flushDrafts, queueDraft, readDrafts } from './draftRecovery'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.isTauri.mockReturnValue(true)
})
describe('independent unsaved recovery copies', () => {
  it('orders deletion after an in-flight snapshot so discard cannot resurrect a copy', async () => {
    let finish!: () => void
    mocks.invoke
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValue(undefined)
    const write = queueDraft('draft', 'confirmed 中文')
    await Promise.resolve()
    await Promise.resolve()
    const remove = queueDraft('draft', null)
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    finish()
    await write
    await remove
    await flushDrafts()
    expect(mocks.invoke.mock.calls).toEqual([
      ['write_draft_recovery', { id: 'draft', markdown: 'confirmed 中文' }],
      ['write_draft_recovery', { id: 'draft', markdown: null }],
    ])
  })
  it('can clean up after a failed snapshot and reads only through the native recovery boundary', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    await expect(queueDraft('failed', 'text')).rejects.toThrow('disk full')
    await queueDraft('failed', null)
    mocks.invoke.mockResolvedValueOnce({
      drafts: [{ id: 'recovered', markdown: 'stable' }],
      errors: [],
    })
    await expect(readDrafts()).resolves.toEqual({
      drafts: [{ id: 'recovered', markdown: 'stable' }],
      errors: [],
    })
  })
})

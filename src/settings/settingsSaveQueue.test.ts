import { expect, it, vi } from 'vitest'
import { defaultApplicationSettings } from './applicationSettings'
import { createSettingsSaveQueue } from './settingsSaveQueue'

function deferred() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const state = (sidebarWidth: number) => ({ ...defaultApplicationSettings, sidebarWidth })

it('combines unstarted changes, finishes the active write, and flushes the final successor', async () => {
  const first = deferred()
  const last = deferred()
  const save = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementation(() => last.promise)
  const result = vi.fn()
  const queue = createSettingsSaveQueue(save, result)
  queue.enqueue(state(210))
  queue.enqueue(state(220))
  await Promise.resolve()
  expect(save.mock.calls).toEqual([[state(220)]])
  const flushed = vi.fn()
  const flush = queue.flush().then(flushed)
  for (let width = 230; width <= 310; width += 10) queue.enqueue(state(width))
  first.resolve()
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1][0]).toEqual(state(310))
  expect(flushed).not.toHaveBeenCalled()
  last.resolve()
  await flush
  expect(flushed).toHaveBeenCalledOnce()
  expect(result).toHaveBeenLastCalledWith({ ok: true })
})

it('reports final failure, keeps the queue usable and retries the complete state', async () => {
  const result = vi.fn()
  const save = vi.fn().mockRejectedValueOnce('denied').mockResolvedValue(undefined)
  const queue = createSettingsSaveQueue(save, result)
  queue.enqueue(state(240))
  await queue.flush()
  expect(result).toHaveBeenLastCalledWith({ ok: false, reason: 'denied' })
  queue.enqueue(state(240))
  await queue.flush()
  expect(save.mock.calls).toEqual([[state(240)], [state(240)]])
  expect(result).toHaveBeenLastCalledWith({ ok: true })
})

it('suppresses obsolete failure and includes updates enqueued during settlement', async () => {
  const first = deferred()
  const save = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValue(undefined)
  const result = vi.fn()
  const queue = createSettingsSaveQueue(save, result)
  queue.enqueue(state(220))
  await Promise.resolve()
  queue.enqueue(state(260))
  first.reject('old failure')
  await queue.flush()
  expect(result.mock.calls).toEqual([[{ ok: true }]])
  // Exercise enqueue from a completion microtask, before the old drain clears.
  const flush = queue.flush().then(() => queue.enqueue(state(280)))
  await flush
  await queue.flush()
  expect(save).toHaveBeenLastCalledWith(state(280))
})

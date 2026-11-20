import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
const browse = vi.hoisted(() => vi.fn())
vi.mock('../file-system/nativeMarkdownFile', () => ({ browseMarkdownFolder: browse }))
import { QuickOpen } from './QuickOpen'
const file = (path: string) => ({
  path,
  name: path.split('/').at(-1),
  isDirectory: false,
  children: [],
})
const props = () => ({
  folder: '/root',
  label: '快速打开',
  placeholder: '搜索',
  loading: '仍在搜索',
  limited: '上限',
  retry: '重试',
  noResults: '没有匹配',
  rootLabel: '当前文件夹',
  keyboardHint: '↑ ↓ Enter Esc',
  openFailed: '无法打开',
  scanFailed: '无法读取此文件夹',
  partialSearch: '部分位置未能搜索',
  cancelLabel: '取消',
  onClose: vi.fn(),
  onOpen: vi.fn().mockResolvedValue(true),
})
beforeEach(() => {
  browse.mockReset()
  browse.mockResolvedValue({ children: [file('/root/中文.md')], nextOffset: null })
})
afterEach(cleanup)
it('restores focus during cancellation before the next key and avoids a delayed second restore', async () => {
  const restored = vi.fn(() => document.getElementById('return-target')?.focus())
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button id="return-target" onClick={() => setOpen(true)}>
          打开
        </button>
        <input aria-label="另一个输入框" />
        {open ? (
          <QuickOpen {...props()} onClose={() => setOpen(false)} onClosed={restored} />
        ) : null}
      </>
    )
  }
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '打开' }))
  await screen.findByRole('option')
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '打开' })).toHaveFocus()
  screen.getByRole('textbox', { name: '另一个输入框' }).focus()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(restored).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('textbox', { name: '另一个输入框' })).toHaveFocus()
})
it('retries the original failed file without rescanning; merges repeated Enter and double clicks', async () => {
  const p = props()
  let resolve!: (ok: boolean) => void
  p.onOpen.mockResolvedValueOnce(false).mockImplementationOnce(
    () =>
      new Promise<boolean>((r) => {
        resolve = r
      }),
  )
  render(<QuickOpen {...p} />)
  const option = await screen.findByRole('option')
  fireEvent.click(option)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
  fireEvent.doubleClick(option)
  expect(p.onOpen).toHaveBeenCalledTimes(2)
  expect(p.onOpen.mock.calls.map((c) => c[0])).toEqual(['/root/中文.md', '/root/中文.md'])
  expect(browse).toHaveBeenCalledTimes(1)
  await act(async () => resolve(true))
  expect(p.onClose).toHaveBeenCalledTimes(1)
})
it('retries root scanning without opening a file', async () => {
  browse.mockRejectedValueOnce(new Error('denied'))
  const p = props()
  render(<QuickOpen {...p} />)
  await screen.findByText(/无法读取此文件夹/)
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await screen.findByRole('option')
  expect(browse).toHaveBeenCalledTimes(2)
  expect(p.onOpen).not.toHaveBeenCalled()
})
it('opens the first page before the delayed second page and ignores composition Enter', async () => {
  let finish!: (page: unknown) => void
  browse
    .mockResolvedValueOnce({ children: [file('/root/中文.md')], nextOffset: 200 })
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r
        }),
    )
  const p = props()
  render(<QuickOpen {...p} />)
  await screen.findByRole('option')
  expect(screen.getByRole('status')).toHaveTextContent('仍在搜索')
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', isComposing: true, keyCode: 229 })
  expect(p.onOpen).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
  await waitFor(() => expect(p.onOpen).toHaveBeenCalledTimes(1))
  await act(async () => finish({ children: [], nextOffset: null }))
})
it('keeps selectable partial results and never claims a complete empty search', async () => {
  browse
    .mockResolvedValueOnce({
      children: [
        { ...file('/root/denied'), isDirectory: true },
        { ...file('/root/readable'), isDirectory: true },
      ],
      nextOffset: null,
    })
    .mockRejectedValueOnce(new Error('denied'))
    .mockResolvedValueOnce({ children: [file('/root/readable/目标.md')], nextOffset: null })
  const p = props()
  render(<QuickOpen {...p} />)
  await screen.findByRole('option', { name: /目标.md readable/ })
  expect(screen.getByText('部分位置未能搜索')).toBeVisible()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'missing' } })
  expect(screen.queryByText('没有匹配')).not.toBeInTheDocument()
})
it('aborts only its open request on Escape and ignores a late failure', async () => {
  let finish!: (ok: boolean) => void
  let signal!: AbortSignal
  const p = props()
  p.onOpen.mockImplementation((_path, options) => {
    signal = options.signal
    return new Promise<boolean>((r) => {
      finish = r
    })
  })
  render(<QuickOpen {...p} />)
  fireEvent.click(await screen.findByRole('option'))
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
  await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1))
  expect(signal.aborted).toBe(true)
  await act(async () => finish(false))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('ignores an old root scan after switching to a different root', async () => {
  let finish!: (page: unknown) => void
  browse.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const p = props()
  const view = render(<QuickOpen key="/root" {...p} />)
  browse.mockResolvedValueOnce({ children: [file('/new/目标.md')], nextOffset: null })
  view.rerender(<QuickOpen key="/new" {...p} folder="/new" />)
  await screen.findByRole('option', { name: /目标.md/ })
  await act(async () => finish({ children: [file('/root/旧结果.md')], nextOffset: null }))
  expect(screen.queryByRole('option', { name: /旧结果/ })).not.toBeInTheDocument()
  expect(screen.getAllByRole('option')).toHaveLength(1)
})

import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSidebar } from './FileSidebar'
import { interfaceCopy } from '../app/interfaceCopy'
import type { MarkdownTreeNode } from '../file-system/nativeMarkdownFile'
const mocks = vi.hoisted(() => ({ browseMarkdownFolder: vi.fn() }))
vi.mock('../file-system/nativeMarkdownFile', () => mocks)
const folder = (
  path: string,
  children: MarkdownTreeNode[] = [],
  nextOffset?: number,
): MarkdownTreeNode => ({
  path,
  name: path.split('/').at(-1)!,
  isDirectory: true,
  children,
  nextOffset,
})
const file = (path: string): MarkdownTreeNode => ({ ...folder(path), isDirectory: false })
const props = {
  activeFile: null,
  copy: interfaceCopy('en').sidebar,
  recentFiles: [],
  recentFolders: [],
  width: 224,
  onChooseFolder: vi.fn(),
  onClearRecent: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenFolder: vi.fn(),
  onOpenPreferences: vi.fn(),
  onRemoveRecentFile: vi.fn(),
  onRemoveRecentFolder: vi.fn(),
  onWidthChange: vi.fn(),
}
afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())
describe('folder expansion and request lifetimes', () => {
  it('loads only an expanded directory, retries locally and pages without replacing existing files', async () => {
    mocks.browseMarkdownFolder
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockResolvedValueOnce(folder('/root/sub', [file('/root/sub/first.md')], 200))
      .mockResolvedValueOnce(folder('/root/sub', [file('/root/sub/last.md')]))
    const { container } = render(
      <FileSidebar
        {...props}
        folder="/root"
        tree={folder('/root', [file('/root/visible.md'), folder('/root/sub')])}
      />,
    )
    expect(mocks.browseMarkdownFolder).not.toHaveBeenCalled()
    const branch = container.querySelector('.file-sidebar__directory-toggle')!
    fireEvent.click(branch)
    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
    expect(screen.getByRole('button', { name: 'visible.md' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'first.md' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Load more…' }))
    expect(await screen.findByRole('button', { name: 'last.md' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'first.md' })).toBeVisible()
    expect(mocks.browseMarkdownFolder.mock.calls).toEqual([
      ['/root/sub', false],
      ['/root/sub', false, 0],
      ['/root/sub', false, 200],
    ])
  })
  it('ignores a retired StrictMode request after the newer listing has loaded more pages', async () => {
    let finish!: (tree: MarkdownTreeNode) => void
    mocks.browseMarkdownFolder
      .mockImplementationOnce(
        () =>
          new Promise<MarkdownTreeNode>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce(folder('/root/sub', [file('/root/sub/first.md')], 200))
      .mockResolvedValueOnce(folder('/root/sub', [file('/root/sub/last.md')]))
    render(
      <StrictMode>
        <FileSidebar
          {...props}
          activeFile="/root/sub/first.md"
          folder="/root"
          tree={folder('/root', [folder('/root/sub')])}
        />
      </StrictMode>,
    )
    expect(await screen.findByRole('button', { name: 'first.md' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Load more…' }))
    expect(await screen.findByRole('button', { name: 'last.md' })).toBeVisible()
    await act(async () => finish(folder('/root/sub', [file('/root/sub/stale.md')])))
    expect(screen.getByRole('button', { name: 'last.md' })).toBeVisible()
    expect(screen.queryByText('stale.md')).not.toBeInTheDocument()
  })

  it('ignores an old root result and applies the explicitly chosen exclusion rule', async () => {
    let finish!: (tree: MarkdownTreeNode) => void
    mocks.browseMarkdownFolder
      .mockImplementationOnce(
        () =>
          new Promise<MarkdownTreeNode>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce(folder('/new', [folder('/new/node_modules')]))
    const { rerender } = render(<FileSidebar {...props} folder="/old" tree={folder('/old')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Folder actions' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Show filtered folders' }))
    await waitFor(() => expect(mocks.browseMarkdownFolder).toHaveBeenCalledWith('/old', true, 0))
    rerender(<FileSidebar {...props} folder="/new" tree={folder('/new')} />)
    expect(await screen.findByText('node_modules')).toBeVisible()
    await act(async () => finish(folder('/old', [file('/old/stale.md')])))
    expect(screen.queryByText('stale.md')).not.toBeInTheDocument()
    expect(mocks.browseMarkdownFolder).toHaveBeenLastCalledWith('/new', true)
  })
  it('ignores a late page after refresh and keeps the selected document and expanded branch', async () => {
    let finish!: (tree: MarkdownTreeNode) => void
    const selected = file('/root/sub/selected.md')
    const sub = folder('/root/sub', [selected])
    mocks.browseMarkdownFolder
      .mockImplementationOnce(
        () =>
          new Promise<MarkdownTreeNode>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce(folder('/root', [sub, file('/root/new.md')]))
    render(
      <FileSidebar
        {...props}
        activeFile={selected.path}
        folder="/root"
        tree={folder('/root', [sub], 200)}
      />,
    )
    expect(screen.getByRole('button', { name: 'selected.md' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh folder' }))
    expect(await screen.findByRole('button', { name: 'new.md' })).toBeVisible()
    await act(async () => finish(folder('/root', [file('/root/stale.md')], 400)))
    expect(screen.queryByRole('button', { name: 'stale.md' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'selected.md' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'sub' })).toHaveAttribute('aria-expanded', 'true')
    expect(mocks.browseMarkdownFolder.mock.calls).toEqual([
      ['/root', false, 200],
      ['/root', false, 0],
    ])
  })

  it('retries a failed next page at its original offset without losing earlier results', async () => {
    mocks.browseMarkdownFolder
      .mockRejectedValueOnce(new Error('page unavailable'))
      .mockResolvedValueOnce(folder('/root', [file('/root/second.md')]))
    render(
      <FileSidebar
        {...props}
        folder="/root"
        tree={folder('/root', [file('/root/first.md')], 200)}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more…' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('page unavailable')
    expect(screen.getByRole('button', { name: 'first.md' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'second.md' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'first.md' })).toBeVisible()
    expect(mocks.browseMarkdownFolder.mock.calls).toEqual([
      ['/root', false, 200],
      ['/root', false, 200],
    ])
  })

  it('refreshes only the named subdirectory', async () => {
    mocks.browseMarkdownFolder.mockResolvedValueOnce(
      folder('/root/sub', [file('/root/sub/new.md')]),
    )
    render(
      <FileSidebar
        {...props}
        folder="/root"
        tree={folder('/root', [
          folder('/root/sub', [file('/root/sub/old.md')]),
          file('/root/sibling.md'),
        ])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sub' }))
    expect(await screen.findByRole('button', { name: 'new.md' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'sibling.md' })).toBeVisible()
    expect(mocks.browseMarkdownFolder).toHaveBeenCalledExactlyOnceWith('/root/sub', false, 0)
  })
})

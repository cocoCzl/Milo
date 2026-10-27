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
    const branch = container.querySelector('.file-sidebar__directory') as HTMLDetailsElement
    branch.open = true
    fireEvent(branch, new Event('toggle'))
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show dependency and build folders' }))
    await waitFor(() => expect(mocks.browseMarkdownFolder).toHaveBeenCalledWith('/old', true))
    rerender(<FileSidebar {...props} folder="/new" tree={folder('/new')} />)
    expect(await screen.findByText('node_modules')).toBeVisible()
    await act(async () => finish(folder('/old', [file('/old/stale.md')])))
    expect(screen.queryByText('stale.md')).not.toBeInTheDocument()
    expect(mocks.browseMarkdownFolder).toHaveBeenLastCalledWith('/new', true)
  })
})

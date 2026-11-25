import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSidebar } from './FileSidebar'
import { SidebarStateStore } from './sidebarState'
import { interfaceCopy } from '../app/interfaceCopy'
import type { MarkdownTreeNode } from '../file-system/nativeMarkdownFile'
const mocks = vi.hoisted(() => ({
  browseMarkdownFolder: vi.fn(),
  validateMarkdownDirectory: vi.fn(),
}))
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
  onRemoveRecentFile: vi.fn(),
  onRemoveRecentFolder: vi.fn(),
  onWidthChange: vi.fn(),
}
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.validateMarkdownDirectory.mockResolvedValue(true)
})
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
    expect(screen.queryByText('node_modules')).not.toBeInTheDocument()
    await act(async () => finish(folder('/old', [file('/old/stale.md')])))
    expect(screen.queryByText('stale.md')).not.toBeInTheDocument()
    expect(mocks.browseMarkdownFolder).toHaveBeenLastCalledWith('/old', true, 0)
    fireEvent.click(screen.getByRole('button', { name: 'Folder actions' }))
    expect(screen.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'false')
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

it('unmounts the tree but restores expanded paths, scroll and loaded pages on showing it again', async () => {
  const store = new SidebarStateStore()
  const selected = file('/root/sub/selected.md')
  const root = {
    ...folder('/root', [folder('/root/sub', [selected])], 200),
    snapshotId: 'snapshot-A',
  }
  mocks.browseMarkdownFolder.mockResolvedValueOnce({
    ...folder('/root', [file('/root/last.md')]),
    snapshotId: 'snapshot-A',
  })
  const view = () => (
    <FileSidebar
      {...props}
      stateStore={store}
      folder="/root"
      tree={root}
      activeFile={selected.path}
    />
  )
  const { rerender, container } = render(view())
  await screen.findByRole('button', { name: 'selected.md' })
  fireEvent.click(screen.getByRole('button', { name: 'Load more…' }))
  expect(await screen.findByRole('button', { name: 'last.md' })).toBeVisible()
  const body = container.querySelector('.file-sidebar__body')!
  body.scrollTop = 144
  fireEvent.scroll(body)
  rerender(<></>)
  expect(container.querySelector('.file-sidebar')).toBeNull()
  rerender(view())
  expect(screen.getByRole('button', { name: 'sub' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'selected.md' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(screen.getByRole('button', { name: 'last.md' })).toBeVisible()
  expect(container.querySelector('.file-sidebar__body')!.scrollTop).toBe(144)
  expect(mocks.browseMarkdownFolder).toHaveBeenCalledExactlyOnceWith(
    '/root',
    false,
    200,
    'snapshot-A',
  )
  fireEvent.click(screen.getByRole('button', { name: 'sub' }))
  rerender(<></>)
  rerender(view())
  expect(screen.getByRole('button', { name: 'sub' })).toHaveAttribute('aria-expanded', 'false')
})

it('keeps each folder filter separate and restores the earlier folder after a round trip', async () => {
  const store = new SidebarStateStore()
  const a = folder('/a')
  mocks.browseMarkdownFolder.mockResolvedValueOnce(
    folder('/a', [folder('/a/node_modules', [file('/a/node_modules/one.md')])]),
  )
  const { rerender } = render(<FileSidebar {...props} stateStore={store} folder="/a" tree={a} />)
  fireEvent.click(screen.getByRole('button', { name: 'Folder actions' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox'))
  fireEvent.click(await screen.findByRole('button', { name: 'node_modules' }))
  rerender(<FileSidebar {...props} stateStore={store} folder="/b" tree={folder('/b')} />)
  fireEvent.click(screen.getByRole('button', { name: 'Folder actions' }))
  expect(screen.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'false')
  rerender(<FileSidebar {...props} stateStore={store} folder="/a" tree={a} />)
  expect(screen.getByRole('button', { name: 'node_modules' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Folder actions' }))
  expect(screen.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'true')
  expect(mocks.browseMarkdownFolder).toHaveBeenCalledExactlyOnceWith('/a', true, 0)
})

it('keeps old results on snapshot expiry and retries from zero rather than appending a new snapshot', async () => {
  mocks.browseMarkdownFolder
    .mockRejectedValueOnce('DIRECTORY_SNAPSHOT_STALE: expired')
    .mockResolvedValueOnce({ ...folder('/root', [file('/root/fresh.md')]), snapshotId: 'new' })
  render(
    <FileSidebar
      {...props}
      folder="/root"
      tree={{ ...folder('/root', [file('/root/old.md')], 200), snapshotId: 'old' }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Load more…' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(props.copy.pageExpired)
  expect(screen.getByRole('button', { name: 'old.md' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('button', { name: 'fresh.md' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'old.md' })).toBeNull()
  expect(mocks.browseMarkdownFolder.mock.calls).toEqual([
    ['/root', false, 200, 'old'],
    ['/root', false, 0],
  ])
})

it('does not remember a page that completes after the sidebar unmounted', async () => {
  const store = new SidebarStateStore()
  let finish!: (page: MarkdownTreeNode) => void
  const root = { ...folder('/root', [file('/root/first.md')], 200), snapshotId: 'original' }
  mocks.browseMarkdownFolder.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const view = () => <FileSidebar {...props} stateStore={store} folder="/root" tree={root} />
  const { rerender } = render(view())
  fireEvent.click(screen.getByRole('button', { name: 'Load more…' }))
  rerender(<></>)
  await act(async () => finish(folder('/root', [file('/root/late.md')])))
  rerender(view())
  expect(screen.getByRole('button', { name: 'first.md' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'late.md' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Load more…' })).toBeEnabled()
})

it('waits for the selected folder tree before restoring scroll instead of remembering an empty loading view', () => {
  const store = new SidebarStateStore()
  const state = store.folder('/a')
  state.scrollTop = 177
  const { container, rerender } = render(
    <FileSidebar {...props} stateStore={store} folder="/a" tree={folder('/b')} />,
  )
  const body = container.querySelector('.file-sidebar__body')!
  body.scrollTop = 0
  fireEvent.scroll(body)
  expect(state.scrollTop).toBe(177)
  rerender(
    <FileSidebar
      {...props}
      stateStore={store}
      folder="/a"
      tree={folder('/a', [file('/a/one.md')])}
    />,
  )
  expect(body.scrollTop).toBe(177)
})

it('rejects a mismatched response token and retains the original page until explicit retry', async () => {
  mocks.browseMarkdownFolder.mockResolvedValueOnce({
    ...folder('/root', [file('/root/wrong.md')]),
    snapshotId: 'replacement',
  })
  render(
    <FileSidebar
      {...props}
      folder="/root"
      tree={{ ...folder('/root', [file('/root/original.md')], 200), snapshotId: 'original' }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Load more…' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(props.copy.pageExpired)
  expect(screen.queryByRole('button', { name: 'wrong.md' })).toBeNull()
  expect(screen.getByRole('button', { name: 'original.md' })).toBeVisible()
})

it.each([true, false])(
  'does not adopt a root response started under the opposite filter: selected=%s',
  async (selected) => {
    const store = new SidebarStateStore()
    const state = store.folder('/root')
    state.showExcluded = selected
    const wrong = folder('/root', [file('/root/wrong-filter.md')])
    store.remember(state, '/root', !selected, { page: wrong, error: null, failedOffset: null })
    mocks.browseMarkdownFolder.mockResolvedValueOnce(
      folder('/root', [file('/root/correct-filter.md')]),
    )
    render(<FileSidebar {...props} stateStore={store} folder="/root" tree={wrong} />)
    expect(await screen.findByRole('button', { name: 'correct-filter.md' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'wrong-filter.md' })).toBeNull()
    expect(mocks.browseMarkdownFolder).toHaveBeenCalledExactlyOnceWith('/root', selected, 0)
  },
)

it('revalidates restored rows through native metadata and clears changed listings before retry', async () => {
  const store = new SidebarStateStore()
  const state = store.folder('/root')
  const root = {
    ...folder('/root', [file('/root/deleted.md')], 200),
    snapshotId: 'old',
    directoryVersion: 'old-version',
  }
  store.remember(state, '/root', false, { page: root, error: null, failedOffset: null })
  mocks.validateMarkdownDirectory.mockResolvedValueOnce(false)
  mocks.browseMarkdownFolder.mockResolvedValueOnce({
    ...folder('/root', [file('/root/new.md')]),
    snapshotId: 'new',
    directoryVersion: 'new-version',
  })
  render(<FileSidebar {...props} stateStore={store} folder="/root" tree={root} />)
  expect(await screen.findByRole('alert')).toHaveTextContent(props.copy.pageExpired)
  expect(screen.queryByRole('button', { name: 'deleted.md' })).toBeNull()
  expect(mocks.validateMarkdownDirectory).toHaveBeenCalledWith('/root', 'old-version')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('button', { name: 'new.md' })).toBeVisible()
  expect(mocks.browseMarkdownFolder).toHaveBeenCalledWith('/root', false, 0)
})

it('revalidates the first-page fallback when the remembered merged pages were evicted', async () => {
  const store = new SidebarStateStore(8, 0)
  const root = {
    ...folder('/root', [file('/root/deleted.md')]),
    directoryVersion: 'gone',
    snapshotId: 'old',
  }
  mocks.validateMarkdownDirectory.mockResolvedValue(false)
  render(<FileSidebar {...props} stateStore={store} folder="/root" tree={root} />)
  expect(await screen.findByRole('alert')).toHaveTextContent(props.copy.pageExpired)
  expect(screen.queryByRole('button', { name: 'deleted.md' })).toBeNull()
  expect(mocks.validateMarkdownDirectory).toHaveBeenCalledWith('/root', 'gone')
})

import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FileSidebar } from './FileSidebar'

const copy = {
  changeFolder: 'Change folder',
  chooseFolder: 'Choose folder…',
  clearRecent: 'Clear',
  currentFolder: 'Current folder',
  empty: 'Browse documents in a folder.',
  emptyDirectory: 'No Markdown files in this folder.',
  showExcluded: 'Show dependency and build folders',
  loadMore: 'Load more…',
  retry: 'Retry',
  loadingFolder: 'Loading folder…',
  folderWidth: 'Folder width',
  emptyRecent: 'No recent items.',
  recent: 'Recent',
  recentLabel: 'Recent files and folders',
  removeRecent: (name: string) => `Remove ${name} from recent`,
  settings: 'Settings',
  workspace: 'Folder',
}

afterEach(cleanup)

describe('FileSidebar', () => {
  it('lets the user choose a different folder after one is already open', () => {
    const onChooseFolder = vi.fn()

    render(
      <FileSidebar
        activeFile={null}
        copy={copy}
        folder="/notes/current"
        recentFiles={[]}
        recentFolders={[]}
        tree={{ children: [], isDirectory: true, name: 'current', path: '/notes/current' }}
        width={224}
        onChooseFolder={onChooseFolder}
        onClearRecent={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenPreferences={vi.fn()}
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Change folder' }))

    expect(onChooseFolder).toHaveBeenCalledOnce()
  })

  it('clears or removes recent records without opening their files or folders', () => {
    const onClearRecent = vi.fn()
    const onOpenFile = vi.fn()
    const onOpenFolder = vi.fn()
    const onRemoveRecentFile = vi.fn()
    const onRemoveRecentFolder = vi.fn()

    render(
      <FileSidebar
        activeFile={null}
        copy={copy}
        folder={null}
        recentFiles={['/notes/one.md']}
        recentFolders={['/notes/archive']}
        tree={null}
        width={224}
        onChooseFolder={vi.fn()}
        onClearRecent={onClearRecent}
        onOpenFile={onOpenFile}
        onOpenFolder={onOpenFolder}
        onOpenPreferences={vi.fn()}
        onRemoveRecentFile={onRemoveRecentFile}
        onRemoveRecentFolder={onRemoveRecentFolder}
        onWidthChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove one.md from recent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove archive from recent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onRemoveRecentFile).toHaveBeenCalledWith('/notes/one.md')
    expect(onRemoveRecentFolder).toHaveBeenCalledWith('/notes/archive')
    expect(onClearRecent).toHaveBeenCalledOnce()
    expect(onOpenFile).not.toHaveBeenCalled()
    expect(onOpenFolder).not.toHaveBeenCalled()
  })

  it('renders the four-level product navigation and opens existing preferences', () => {
    const onOpenPreferences = vi.fn()
    const { container } = render(
      <FileSidebar
        activeFile="/notes/current/one.md"
        copy={copy}
        folder="/notes/current"
        recentFiles={['/notes/current/one.md']}
        recentFolders={[]}
        tree={{
          children: [
            { children: [], isDirectory: false, name: 'one.md', path: '/notes/current/one.md' },
          ],
          isDirectory: true,
          name: 'current',
          path: '/notes/current',
        }}
        width={224}
        onChooseFolder={vi.fn()}
        onClearRecent={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenPreferences={onOpenPreferences}
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={vi.fn()}
      />,
    )

    expect(container.querySelector('.file-sidebar__brand')).toHaveTextContent('Milo')
    expect(screen.getByRole('region', { name: 'Recent files and folders' })).toBeVisible()
    const workspace = screen.getByRole('region', { name: 'Folder' })
    expect(workspace).toHaveTextContent('current')
    expect(workspace).toHaveTextContent('one.md')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onOpenPreferences).toHaveBeenCalledOnce()
  })

  it('keeps empty navigation sections structured', () => {
    render(
      <FileSidebar
        activeFile={null}
        copy={copy}
        folder={null}
        recentFiles={[]}
        recentFolders={[]}
        tree={null}
        width={224}
        onChooseFolder={vi.fn()}
        onClearRecent={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenPreferences={vi.fn()}
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('region', { name: 'Recent files and folders' })).toHaveTextContent(
      'No recent items.',
    )
    const workspace = screen.getByRole('region', { name: 'Folder' })
    expect(workspace).not.toHaveTextContent('No folder selected')
    expect(screen.queryByRole('button', { name: 'Change folder' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeVisible()
    expect(workspace).toHaveTextContent('Browse documents in a folder.')
    expect(screen.getByRole('button', { name: 'Settings' })).toBeVisible()
  })

  it.each([null, '/notes/current'])('keeps Folder before Recent and Settings for %s', (folder) => {
    const onChooseFolder = vi.fn()
    const onOpenFile = vi.fn()
    const onOpenFolder = vi.fn()
    const { container } = render(
      <FileSidebar
        activeFile="/notes/current/one.md"
        copy={copy}
        folder={folder}
        tree={
          folder
            ? {
                children: [
                  {
                    children: [],
                    isDirectory: false,
                    name: 'one.md',
                    path: '/notes/current/one.md',
                  },
                ],
                isDirectory: true,
                name: 'current',
                path: folder,
              }
            : null
        }
        recentFiles={['/notes/current/one.md']}
        recentFolders={['/notes/archive']}
        width={224}
        onChooseFolder={onChooseFolder}
        onClearRecent={vi.fn()}
        onOpenFile={onOpenFile}
        onOpenFolder={onOpenFolder}
        onOpenPreferences={vi.fn()}
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={vi.fn()}
      />,
    )
    expect(
      screen.getAllByRole('region').map((region) => region.getAttribute('aria-label')),
    ).toEqual(['Folder', 'Recent files and folders'])
    const buttons = Array.from(container.querySelectorAll('button')).map(
      (button) => button.getAttribute('aria-label') ?? button.textContent,
    )
    expect(buttons).toEqual([
      ...(folder ? ['Change folder', 'one.md'] : ['Choose folder…']),
      'Clear',
      'one.md',
      'Remove one.md from recent',
      'archive',
      'Remove archive from recent',
      'Settings',
    ])
    // Native buttons stay in their DOM order in sequential keyboard navigation.
    // Verify each control remains focusable rather than hiding or reordering it.
    for (const button of container.querySelectorAll('button')) {
      expect(button.tabIndex).toBe(0)
      expect(button).toBeEnabled()
      button.focus()
      expect(button).toHaveFocus()
    }
    expect(container.querySelectorAll('[tabindex="-1"]')).toHaveLength(0)
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(1)
    fireEvent.click(
      screen.getByRole('button', { name: folder ? 'Change folder' : 'Choose folder…' }),
    )
    expect(onChooseFolder).toHaveBeenCalledOnce()
    const recent = screen.getByRole('region', { name: 'Recent files and folders' })
    const details = recent.querySelector('details')!
    if (!details.open) fireEvent.click(recent.querySelector('summary')!)
    fireEvent.click(within(recent).getByRole('button', { name: 'one.md' }))
    fireEvent.click(within(recent).getByRole('button', { name: 'archive' }))
    expect(onOpenFile).toHaveBeenCalledWith('/notes/current/one.md')
    expect(onOpenFolder).toHaveBeenCalledWith('/notes/archive')
    if (folder)
      expect(
        within(screen.getByRole('region', { name: 'Folder' })).getByRole('button', {
          name: 'one.md',
        }),
      ).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    { tree: null, error: null, message: 'Loading folder…' },
    {
      tree: { children: [], isDirectory: true, name: 'current', path: '/notes/current' },
      error: null,
      message: 'No Markdown files in this folder.',
    },
    { tree: null, error: 'Could not read folder.', message: 'Could not read folder.' },
    {
      tree: { children: [], isDirectory: true, name: 'old', path: '/notes/old' },
      error: null,
      message: 'Loading folder…',
    },
  ])('distinguishes selected folder state: $message', ({ tree, error, message }) => {
    render(
      <FileSidebar
        activeFile={null}
        copy={copy}
        folder="/notes/current"
        folderError={error}
        tree={tree}
        width={224}
        recentFiles={[]}
        recentFolders={[]}
        onChooseFolder={vi.fn()}
        onClearRecent={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenPreferences={vi.fn()}
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={vi.fn()}
      />,
    )
    const folder = screen.getByRole('region', { name: 'Folder' })
    expect(folder).toHaveTextContent(message)
    expect(folder).not.toHaveTextContent(copy.empty)
    expect(screen.queryByRole('button', { name: 'Choose folder…' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change folder' })).toBeEnabled()
  })

  it('supports pointer and keyboard resizing within the product range', () => {
    const onWidthChange = vi.fn()
    render(
      <FileSidebar
        activeFile={null}
        copy={copy}
        folder={null}
        recentFiles={[]}
        recentFolders={[]}
        tree={null}
        width={224}
        onChooseFolder={vi.fn()}
        onClearRecent={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenPreferences={vi.fn()}
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={onWidthChange}
      />,
    )
    const separator = screen.getByRole('separator', { name: 'Folder width' })
    expect(separator).toHaveAttribute('aria-valuemin', '208')
    expect(separator).toHaveAttribute('aria-valuemax', '320')
    expect(separator).toHaveAttribute('aria-valuenow', '224')
    expect(separator).toHaveAttribute('tabindex', '0')
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')

    separator.focus()
    expect(separator).toHaveFocus()
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenLastCalledWith(232)
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(onWidthChange).toHaveBeenLastCalledWith(216)
    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true })
    expect(onWidthChange).toHaveBeenLastCalledWith(256)
    fireEvent.keyDown(separator, { key: 'ArrowLeft', shiftKey: true })
    expect(onWidthChange).toHaveBeenLastCalledWith(208)

    render(
      <FileSidebar
        activeFile={null}
        copy={copy}
        folder={null}
        recentFiles={[]}
        recentFolders={[]}
        tree={null}
        width={208}
        onChooseFolder={vi.fn()}
        onClearRecent={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenPreferences={vi.fn()}
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={onWidthChange}
      />,
    )
    const minSeparator = screen.getAllByRole('separator', { name: 'Folder width' }).at(-1)!
    fireEvent.keyDown(minSeparator, { key: 'ArrowLeft' })
    expect(onWidthChange).toHaveBeenLastCalledWith(208)

    render(
      <FileSidebar
        activeFile={null}
        copy={copy}
        folder={null}
        recentFiles={[]}
        recentFolders={[]}
        tree={null}
        width={320}
        onChooseFolder={vi.fn()}
        onClearRecent={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenPreferences={vi.fn()}
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={onWidthChange}
      />,
    )
    const maxSeparator = screen.getAllByRole('separator', { name: 'Folder width' }).at(-1)!
    fireEvent.keyDown(maxSeparator, { key: 'ArrowRight', shiftKey: true })
    expect(onWidthChange).toHaveBeenLastCalledWith(320)

    const pointerDown = createEvent.pointerDown(separator)
    Object.defineProperties(pointerDown, { button: { value: 0 }, clientX: { value: 100 } })
    fireEvent(separator, pointerDown)
    expect(separator).toHaveFocus()
    const pointerMove = createEvent.pointerMove(window)
    Object.defineProperty(pointerMove, 'clientX', { value: 500 })
    fireEvent(window, pointerMove)
    fireEvent.pointerUp(window)
    expect(onWidthChange).toHaveBeenLastCalledWith(320)
  })
})

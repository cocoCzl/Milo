import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FileSidebar } from './FileSidebar'
import { interfaceCopy } from '../app/interfaceCopy'

const copy = {
  ...interfaceCopy('en').sidebar,
  changeFolder: 'Change folder',
  chooseFolder: 'Choose folder…',
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
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: copy.folderActions }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change folder' }))

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
        onRemoveRecentFile={onRemoveRecentFile}
        onRemoveRecentFolder={onRemoveRecentFolder}
        onWidthChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove one.md from recent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove archive from recent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear recent records' }))

    expect(onRemoveRecentFile).toHaveBeenCalledWith('/notes/one.md')
    expect(onRemoveRecentFolder).toHaveBeenCalledWith('/notes/archive')
    expect(onClearRecent).toHaveBeenCalledOnce()
    expect(onOpenFile).not.toHaveBeenCalled()
    expect(onOpenFolder).not.toHaveBeenCalled()
  })

  it('keeps folder and recent navigation without a redundant settings entry', () => {
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
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it.each([null, '/notes/current'])('keeps Folder before Recent for %s', (folder) => {
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
      ...(folder ? ['Refresh folder', copy.folderActions, 'one.md'] : ['Choose folder…']),
      'one.md',
      'Remove one.md from recent',
      'archive',
      'Remove archive from recent',
      copy.clearRecent,
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
      screen.getByRole('button', { name: folder ? copy.folderActions : 'Choose folder…' }),
    )
    if (folder) fireEvent.click(screen.getByRole('menuitem', { name: 'Change folder' }))
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
        onRemoveRecentFile={vi.fn()}
        onRemoveRecentFolder={vi.fn()}
        onWidthChange={vi.fn()}
      />,
    )
    const folder = screen.getByRole('region', { name: 'Folder' })
    expect(folder).toHaveTextContent(message)
    expect(folder).not.toHaveTextContent(copy.empty)
    expect(screen.queryByRole('button', { name: 'Choose folder…' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: copy.folderActions })).toBeEnabled()
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

it('keeps folder filtering in a keyboard menu and restores focus on Escape', () => {
  render(
    <FileSidebar
      activeFile={null}
      copy={copy}
      folder="/notes"
      tree={{ path: '/notes', name: 'notes', isDirectory: true, children: [] }}
      width={224}
      recentFiles={[]}
      recentFolders={[]}
      onChooseFolder={vi.fn()}
      onClearRecent={vi.fn()}
      onOpenFile={vi.fn()}
      onOpenFolder={vi.fn()}
      onRemoveRecentFile={vi.fn()}
      onRemoveRecentFolder={vi.fn()}
      onWidthChange={vi.fn()}
    />,
  )
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: copy.folderActions })
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  expect(screen.getByRole('menuitem', { name: 'Change folder' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
  expect(screen.getByRole('menuitemcheckbox')).toHaveFocus()
  expect(screen.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByRole('menuitemcheckbox')).toHaveAccessibleDescription(copy.filterDescription)
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  expect(trigger).toHaveFocus()
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it.each([true, false])(
  'returns focus after clearing recent records while expanded=%s',
  (expanded) => {
    const clear = vi.fn()
    const open = vi.fn()
    function RecentSidebar() {
      const [records, setRecords] = useState(['/notes/a.md'])
      return (
        <FileSidebar
          activeFile="/notes/a.md"
          copy={copy}
          folder={expanded ? null : '/notes'}
          tree={null}
          width={224}
          recentFiles={records}
          recentFolders={[]}
          onChooseFolder={vi.fn()}
          onClearRecent={() => {
            clear()
            setRecords([])
          }}
          onOpenFile={open}
          onOpenFolder={open}
          onRemoveRecentFile={vi.fn()}
          onRemoveRecentFolder={vi.fn()}
          onWidthChange={vi.fn()}
        />
      )
    }
    const { container } = render(<RecentSidebar />)
    const details = container.querySelector('details')!
    const summary = details.querySelector('summary')!
    const button = screen.getByRole('button', { name: copy.clearRecent })
    expect(details.open).toBe(expanded)
    expect(button.querySelector('.lucide-eraser')).toBeInTheDocument()
    button.focus()
    fireEvent.click(button)
    expect(screen.queryByRole('button', { name: copy.clearRecent })).not.toBeInTheDocument()
    expect(summary).toHaveFocus()
    expect(details.open).toBe(expanded)
    expect(clear).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()
  },
)

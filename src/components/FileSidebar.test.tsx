import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FileSidebar } from './FileSidebar'

const copy = {
  changeFolder: 'Change folder',
  chooseFolder: 'Choose folder',
  clearRecent: 'Clear',
  currentFolder: 'Current folder',
  empty: 'Open a folder.',
  emptyDirectory: 'This workspace is empty.',
  emptyFolder: 'No folder selected',
  emptyRecent: 'No recent items.',
  recent: 'Recent',
  recentLabel: 'Recent files and folders',
  removeRecent: (name: string) => `Remove ${name} from recent`,
  settings: 'Settings',
  workspace: 'Workspace',
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
        tree={{ children: [{ children: [], isDirectory: false, name: 'one.md', path: '/notes/current/one.md' }], isDirectory: true, name: 'current', path: '/notes/current' }}
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

    expect(container.querySelector('.file-sidebar__brand')).toHaveTextContent('MiloWrite a clearer tomorrow')
    expect(screen.getByRole('region', { name: 'Recent files and folders' })).toBeVisible()
    const workspace = screen.getByRole('region', { name: 'Workspace' })
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

    expect(screen.getByRole('region', { name: 'Recent files and folders' })).toHaveTextContent('No recent items.')
    const workspace = screen.getByRole('region', { name: 'Workspace' })
    expect(workspace).toHaveTextContent('No folder selected')
    expect(workspace).toHaveTextContent('Open a folder.')
    expect(screen.getByRole('button', { name: 'Settings' })).toBeVisible()
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
    const separator = screen.getByRole('separator', { name: 'Workspace width' })
    expect(separator).toHaveAttribute('aria-valuemin', '208')
    expect(separator).toHaveAttribute('aria-valuemax', '320')
    expect(separator).toHaveAttribute('aria-valuenow', '224')

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenLastCalledWith(232)
    fireEvent.keyDown(separator, { key: 'ArrowLeft', shiftKey: true })
    expect(onWidthChange).toHaveBeenLastCalledWith(208)

    const pointerDown = createEvent.pointerDown(separator)
    Object.defineProperties(pointerDown, { button: { value: 0 }, clientX: { value: 100 } })
    fireEvent(separator, pointerDown)
    const pointerMove = createEvent.pointerMove(window)
    Object.defineProperty(pointerMove, 'clientX', { value: 500 })
    fireEvent(window, pointerMove)
    fireEvent.pointerUp(window)
    expect(onWidthChange).toHaveBeenLastCalledWith(320)
  })
})

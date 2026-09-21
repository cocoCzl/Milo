import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FileSidebar } from './FileSidebar'

describe('FileSidebar', () => {
  it('lets the user choose a different folder after one is already open', () => {
    const onChooseFolder = vi.fn()

    render(
      <FileSidebar
        activeFile={null}
        copy={{
          changeFolder: 'Change folder',
          chooseFolder: 'Choose folder',
          currentFolder: 'Current folder',
          empty: 'Open a folder.',
          emptyFolder: 'No folder selected',
          files: 'Files',
          clearRecent: 'Clear',
          recent: 'Recent',
          recentLabel: 'Recent files and folders',
          removeRecent: (name) => `Remove ${name} from recent`,
        }}
        folder="/notes/current"
        recentFiles={[]}
        recentFolders={[]}
        tree={{ children: [], isDirectory: true, name: 'current', path: '/notes/current' }}
        width={240}
        onChooseFolder={onChooseFolder}
        onClearRecent={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
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
        copy={{
          changeFolder: 'Change folder', chooseFolder: 'Choose folder', clearRecent: 'Clear', currentFolder: 'Current folder',
          empty: 'Open a folder.', emptyFolder: 'No folder selected', files: 'Files', recent: 'Recent', recentLabel: 'Recent files and folders',
          removeRecent: (name) => `Remove ${name} from recent`,
        }}
        folder={null}
        recentFiles={['/notes/one.md']}
        recentFolders={['/notes/archive']}
        tree={null}
        width={240}
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
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onRemoveRecentFile).toHaveBeenCalledWith('/notes/one.md')
    expect(onRemoveRecentFolder).toHaveBeenCalledWith('/notes/archive')
    expect(onClearRecent).toHaveBeenCalledOnce()
    expect(onOpenFile).not.toHaveBeenCalled()
    expect(onOpenFolder).not.toHaveBeenCalled()
  })
})

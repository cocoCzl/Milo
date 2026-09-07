import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FileSidebar } from './FileSidebar'

describe('FileSidebar', () => {
  it('lets the user choose a different folder after one is already open', () => {
    const onChooseFolder = vi.fn()

    render(
      <FileSidebar
        copy={{
          changeFolder: 'Change folder',
          chooseFolder: 'Choose folder',
          currentFolder: 'Current folder',
          empty: 'Open a folder.',
          emptyFolder: 'No folder selected',
          recent: 'Recent',
          recentLabel: 'Recent files and folders',
        }}
        folder="/notes/current"
        recentFiles={[]}
        recentFolders={[]}
        tree={{ children: [], isDirectory: true, name: 'current', path: '/notes/current' }}
        width={240}
        onChooseFolder={onChooseFolder}
        onOpenFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onWidthChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Change folder' }))

    expect(onChooseFolder).toHaveBeenCalledOnce()
  })
})

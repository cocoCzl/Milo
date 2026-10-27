import { cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { EditorOutline, type OutlinePreferences } from './EditorOutline'
afterEach(cleanup)
it('folds sections and filters levels without changing the heading source or active position', () => {
  const headings = [
    { id: 'one', key: 'one', text: '第一章', level: 1, pos: 0 },
    { id: 'two', key: 'two', text: '细节', level: 2, pos: 10 },
    { id: 'three', key: 'three', text: '更深', level: 3, pos: 20 },
    { id: 'four', key: 'four', text: '第二章', level: 1, pos: 30 },
  ]
  const onSelect = vi.fn()
  function Outline() {
    const [preferences, setPreferences] = useState<OutlinePreferences>({
      depth: 3,
      collapsed: new Set(),
    })
    return (
      <EditorOutline
        activePosition={20}
        closeLabel="Close"
        drawer={false}
        emptyLabel="Empty"
        headings={headings}
        label="Outline"
        onSelect={onSelect}
        preferences={preferences}
        onPreferencesChange={setPreferences}
      />
    )
  }
  const { getByRole, queryByRole } = render(<Outline />)
  fireEvent.click(getByRole('button', { name: 'Collapse section: 第一章' }))
  expect(queryByRole('button', { name: '细节' })).not.toBeInTheDocument()
  expect(getByRole('button', { name: '第一章' }).parentElement).toHaveClass(
    'editor-outline__ancestor',
  )
  fireEvent.click(getByRole('button', { name: 'Expand section: 第一章' }))
  fireEvent.change(getByRole('combobox', { name: 'Heading levels' }), { target: { value: '1' } })
  expect(queryByRole('button', { name: '更深' })).not.toBeInTheDocument()
  expect(headings).toHaveLength(4)
  expect(onSelect).not.toHaveBeenCalled()
})

import { cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { EditorOutline, type OutlinePreferences } from './EditorOutline'

afterEach(cleanup)

const headings = Array.from({ length: 6 }, (_, index) => ({
  id: `heading-${index + 1}`,
  key: `heading-${index + 1}`,
  text: `标题 ${index + 1}`,
  level: index + 1,
  pos: index * 10,
}))
const props = {
  activePosition: 20,
  closeLabel: 'Close',
  drawer: false,
  emptyLabel: 'Empty',
  headings,
  label: 'Outline',
  onSelect: vi.fn(),
}

it('defaults to H1–H3 with a custom Radix trigger', () => {
  const { container, getByRole } = render(
    <EditorOutline {...props} onPreferencesChange={vi.fn()} />,
  )
  expect(getByRole('combobox', { name: 'Heading levels' })).toHaveTextContent('Show to H3')
  expect(getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  expect(getByRole('combobox')).toHaveAttribute('tabindex', '0')
  expect(container.querySelector('select')).toBeNull()
  expect(container.querySelectorAll('.editor-outline__item')).toHaveLength(3)
})

it.each([1, 2, 3, 4, 5, 6])(
  'depth %i filters the outline without changing heading identities',
  (depth) => {
    const onSelect = vi.fn()
    const { container, getByRole } = render(
      <EditorOutline
        {...props}
        onSelect={onSelect}
        preferences={{ depth, collapsed: new Set() }}
        onPreferencesChange={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('.editor-outline__item')).toHaveLength(depth)
    for (const heading of headings.slice(0, depth)) {
      expect(getByRole('button', { name: heading.text })).toHaveAttribute(
        'data-heading-key',
        heading.key,
      )
    }
    expect(headings).toHaveLength(6)
    expect(onSelect).not.toHaveBeenCalled()
  },
)

it('folds sections without leaving hidden children in the keyboard order or changing the active position', () => {
  function Outline() {
    const [preferences, setPreferences] = useState<OutlinePreferences>({
      depth: 3,
      collapsed: new Set(),
    })
    return (
      <EditorOutline {...props} preferences={preferences} onPreferencesChange={setPreferences} />
    )
  }
  const { getByRole, queryByRole } = render(<Outline />)
  fireEvent.click(getByRole('button', { name: 'Collapse section: 标题 1' }))
  expect(queryByRole('button', { name: '标题 2' })).not.toBeInTheDocument()
  expect(queryByRole('button', { name: '标题 3' })).not.toBeInTheDocument()
  expect(getByRole('button', { name: '标题 1' }).parentElement).toHaveClass(
    'editor-outline__ancestor',
  )
  fireEvent.click(getByRole('button', { name: 'Expand section: 标题 1' }))
  expect(getByRole('button', { name: '标题 3' })).toHaveAttribute('aria-current', 'location')
})

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Select } from './Select'

afterEach(cleanup)

const options = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

describe('Select', () => {
  it('renders a controlled Radix trigger without native select elements', () => {
    render(<Select aria-label="Appearance" options={options} value="system" onValueChange={vi.fn()} />)

    const trigger = screen.getByRole('combobox', { name: 'Appearance' })
    expect(trigger).toHaveTextContent('System')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveClass('milo-select__trigger')
    expect(document.querySelector('select')).not.toBeInTheDocument()
    expect(document.querySelector('option')).not.toBeInTheDocument()
  })

  it('reflects controlled value changes through the shared trigger', () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<Select aria-label="Appearance" options={options} value="system" onValueChange={onValueChange} />)
    expect(screen.getByRole('combobox', { name: 'Appearance' })).toHaveTextContent('System')

    rerender(<Select aria-label="Appearance" options={options} value="dark" onValueChange={onValueChange} />)
    expect(screen.getByRole('combobox', { name: 'Appearance' })).toHaveTextContent('Dark')
  })

})

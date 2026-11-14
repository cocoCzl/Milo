import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MilkdownEditor } from './MilkdownEditor'

afterEach(cleanup)

describe('MilkdownEditor codeBlocks', () => {
  it('applies Prism syntax decorations to a code block language', async () => {
    const { container } = render(
      <MilkdownEditor initialMarkdown={'```javascript\nconst greeting = "hello"\n```'} />,
    )

    await waitFor(() =>
      expect(container.querySelector('.token.keyword')).toHaveTextContent('const'),
    )
    expect(container.querySelector('.token.string')).toHaveTextContent('"hello"')
  })

  it('keeps code-block authored content on the stable pre content DOM boundary', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown={'```\n你好啊\n```'} />)

    const content = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.code-block-card__content')
      expect(element).toHaveTextContent('你好啊')
      return element!
    })

    expect(content.tagName).toBe('PRE')
    expect(content.querySelector('code')).not.toBeInTheDocument()
  })

  it('edits code-block languages from the embedded header without changing its code', async () => {
    const onMarkdownChange = vi.fn()
    const source = 'const greeting = "hello"'
    const { container, getByRole } = render(
      <MilkdownEditor
        initialMarkdown={`\`\`\`\n${source}\n\`\`\``}
        onMarkdownChange={onMarkdownChange}
      />,
    )

    const language = await waitFor(() =>
      getByRole('button', { name: 'Code block language: Plain text' }),
    )
    expect(container.querySelector('.code-block-card__content')).toHaveTextContent(source)
    expect(container.querySelector('.code-block-card__language-menu')).toBeNull()

    fireEvent.click(language)
    fireEvent.click(getByRole('option', { name: 'JavaScript' }))

    await waitFor(() => {
      expect(getByRole('button', { name: 'Code block language: JavaScript' })).toBeVisible()
      expect(onMarkdownChange).toHaveBeenLastCalledWith(`\`\`\`javascript\n${source}\n\`\`\`\n`)
    })
  })
})

it('creates only the open menu, preserves aliases/unknown identifiers and releases it on backgrounding', async () => {
  const change = vi.fn()
  const source = '```ts\nconst n = 1\n```\n\n```custom-lang\nhello\n```'
  const view = render(<MilkdownEditor initialMarkdown={source} onMarkdownChange={change} />)
  const alias = await view.findByRole('button', { name: 'Code block language: TypeScript' })
  expect(view.getByRole('button', { name: 'Code block language: custom-lang' })).toBeVisible()
  expect(view.container.querySelectorAll('[role="listbox"]')).toHaveLength(0)
  fireEvent.keyDown(alias, { key: 'ArrowDown' })
  expect(view.getByRole('option', { name: 'TypeScript' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
  expect(view.getByRole('option', { name: 'SQL' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(alias).toHaveFocus()
  expect(view.container.querySelectorAll('[role="listbox"]')).toHaveLength(0)
  fireEvent.click(alias)
  view.rerender(
    <MilkdownEditor active={false} initialMarkdown={source} onMarkdownChange={change} />,
  )
  expect(view.container.querySelectorAll('[role="listbox"]')).toHaveLength(0)
  expect(change).not.toHaveBeenCalled()
})

it('announces clipboard rejection and retains authored code', async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  })
  try {
    const view = render(<MilkdownEditor initialMarkdown={'```\n中文 code\n```'} />)
    fireEvent.click(await view.findByRole('button', { name: 'Copy' }))
    await view.findByRole('status', { name: 'Copy failed — try again' })
    expect(view.container.querySelector('pre')).toHaveTextContent('中文 code')
  } finally {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
})

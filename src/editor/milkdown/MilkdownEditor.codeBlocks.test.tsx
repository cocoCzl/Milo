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
    expect(container.querySelector('.code-block-card__language-menu')).toHaveAttribute('hidden')

    fireEvent.click(language)
    fireEvent.click(getByRole('option', { name: 'JavaScript' }))

    await waitFor(() => {
      expect(getByRole('button', { name: 'Code block language: JavaScript' })).toBeVisible()
      expect(onMarkdownChange).toHaveBeenLastCalledWith(`\`\`\`javascript\n${source}\n\`\`\`\n`)
    })
  })
})

import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MilkdownEditor } from './MilkdownEditor'

afterEach(cleanup)

describe('MilkdownEditor', () => {
  it('mounts one editable ProseMirror surface', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="# A quiet page" />)

    await waitFor(() => {
      expect(container.firstElementChild).toHaveAttribute('aria-busy', 'false')
      expect(container.querySelector('.ProseMirror')).toHaveAttribute(
        'aria-label',
        'Untitled Markdown document',
      )
    })

    expect(container.querySelectorAll('.ProseMirror')).toHaveLength(1)
  })

  it('uses localized editor labels and empty-state copy', async () => {
    const { container, getByText } = render(
      <MilkdownEditor
        ariaLabel="未命名 Markdown 文档"
        initialMarkdown=""
        placeholder="从一个想法开始…"
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toHaveAttribute('aria-label', '未命名 Markdown 文档')
    })
    expect(getByText('从一个想法开始…')).toBeVisible()
  })

  it('offers discoverable formatting controls that edit the WYSIWYG document', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="Write here" />)
    const queries = within(container)

    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeInTheDocument())
    expect(container.querySelector('.milkdown-editor')?.matches(
      ':has(.ProseMirror > p:only-child > br.ProseMirror-trailingBreak:only-child)',
    )).toBe(false)
    fireEvent.click(queries.getByRole('button', { name: 'Text style' }))
    fireEvent.click(queries.getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() => expect(container.querySelector('h1')).toHaveTextContent('Write here'))
    expect(queries.getByRole('button', { name: 'Text style' })).toHaveAttribute(
      'title',
      'Text style — Heading 1',
    )

    fireEvent.click(queries.getByRole('button', { name: 'Table' }))
    await waitFor(() => expect(container.querySelector('table')).toBeInTheDocument())
  })

  it('applies a heading style to the empty paragraph being typed in', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="" />)
    const queries = within(container)

    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeInTheDocument())
    fireEvent.click(queries.getByRole('button', { name: 'Text style' }))
    fireEvent.click(queries.getByRole('menuitemradio', { name: 'Heading 1' }))

    await waitFor(() => expect(container.querySelector('.ProseMirror > h1')).toBeInTheDocument())
    expect(queries.getByRole('button', { name: 'Text style' })).toHaveAttribute(
      'title',
      'Text style — Heading 1',
    )
  })

  it('starts a body paragraph when Enter is pressed in a heading', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="" />)
    const queries = within(container)

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })
    fireEvent.click(queries.getByRole('button', { name: 'Text style' }))
    fireEvent.click(queries.getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() => expect(container.querySelector('.ProseMirror > h1')).toBeInTheDocument())

    fireEvent.keyDown(editor!, { key: 'Enter' })

    await waitFor(() => {
      const paragraph = container.querySelector('.ProseMirror > h1 + p')
      const selection = window.getSelection()

      expect(paragraph).toBeInTheDocument()
      expect(selection?.anchorNode === paragraph || paragraph?.contains(selection?.anchorNode ?? null)).toBe(true)
      expect(selection?.anchorOffset).toBe(0)
      expect(queries.getByRole('button', { name: 'Text style' })).toHaveAttribute(
        'title',
        'Text style — Body text',
      )
    })
  })

  it('keeps existing heading text in the heading when Enter creates the body block', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="# 你好" />)

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })
    const heading = editor!.querySelector('h1')
    const range = document.createRange()
    range.selectNodeContents(heading!)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.keyDown(editor!, { key: 'Enter' })

    await waitFor(() => {
      expect(editor!.querySelector('h1')).toHaveTextContent('你好')
      const paragraph = editor!.querySelector('h1 + p')
      expect(paragraph).toBeInTheDocument()
      expect(window.getSelection()?.anchorNode === paragraph || paragraph?.contains(window.getSelection()?.anchorNode ?? null)).toBe(true)
      expect(window.getSelection()?.anchorOffset).toBe(0)
    })
  })

  it('formats the block under the visible cursor instead of the previous heading', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown={'# 标题\n\n正文'} />)
    const queries = within(container)

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })
    const paragraph = container.querySelector<HTMLElement>('.ProseMirror > p')
    expect(paragraph).toHaveTextContent('正文')

    const range = document.createRange()
    range.selectNodeContents(paragraph!)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.click(queries.getByRole('button', { name: 'Text style' }))
    fireEvent.click(queries.getByRole('menuitemradio', { name: 'Heading 2' }))

    await waitFor(() => {
      expect(editor!.querySelector('h1')).toHaveTextContent('标题')
      expect(editor!.querySelector('h2')).toHaveTextContent('正文')
    })
  })

  it('builds a clickable document outline from headings', async () => {
    const { container } = render(
      <MilkdownEditor initialMarkdown={'# First chapter\n\n## A detail\n\nBody'} />,
    )
    const queries = within(container)

    await waitFor(() => {
      expect(queries.getByRole('navigation', { name: 'Outline' })).toBeInTheDocument()
      expect(queries.getByRole('button', { name: 'First chapter' })).toBeVisible()
      expect(queries.getByRole('button', { name: 'A detail' })).toBeVisible()
    })

    fireEvent.click(queries.getByRole('button', { name: 'A detail' }))
    expect(container.querySelector('.ProseMirror')).toHaveFocus()
  })

  it('replaces the WebView menu with localized editing commands', async () => {
    const copy = {
      bold: '粗体',
      copy: '复制',
      cut: '剪切',
      italic: '斜体',
      paste: '粘贴',
      selectAll: '全选',
    }
    const { container, getByRole, queryByRole } = render(<MilkdownEditor copy={copy} initialMarkdown="右键编辑" />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })

    fireEvent.contextMenu(editor!, { clientX: 120, clientY: 160 })

    expect(getByRole('menu')).toBeVisible()
    expect(getByRole('menuitem', { name: /复制/ })).toBeInTheDocument()
    expect(getByRole('menuitem', { name: /粘贴/ })).toBeInTheDocument()
    expect(queryByRole('menuitem', { name: /^Copy/ })).not.toBeInTheDocument()
  })

  it('renders GFM task lists and tables in the editing surface', async () => {
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'- [ ] Shape the draft\n\n| Area | State |\n| --- | --- |\n| Editor | Ready |'}
      />,
    )

    await waitFor(() => {
      expect(
        container.querySelector('li[data-item-type="task"][data-checked="false"]'),
      ).toBeInTheDocument()
      expect(container.querySelector('table')).toBeInTheDocument()
    })
  })

  it('toggles a task when its visual checkbox is clicked', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="- [ ] Shape the draft" />)

    const taskItem = await waitFor(() => {
      const item = container.querySelector<HTMLElement>('li[data-item-type="task"]')
      expect(item).toBeInTheDocument()
      return item
    })

    fireEvent.click(taskItem!, { clientX: 0 })

    await waitFor(() => {
      expect(container.querySelector('li[data-item-type="task"]')).toHaveAttribute(
        'data-checked',
        'true',
      )
    })
  })

  it('keeps remote images unloaded until the author explicitly requests one', async () => {
    const { container, getByRole } = render(
      <MilkdownEditor initialMarkdown="![A remote illustration](https://images.example.test/quiet.png)" />,
    )

    const button = await waitFor(() => getByRole('button', { name: 'Load remote image: A remote illustration' }))
    expect(container.querySelector('img[src^="https://"]')).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Loading image…')
  })

  it('applies Prism syntax decorations to a code block language', async () => {
    const { container } = render(
      <MilkdownEditor initialMarkdown={'```javascript\nconst greeting = "hello"\n```'} />,
    )

    await waitFor(() => expect(container.querySelector('.token.keyword')).toHaveTextContent('const'))
    expect(container.querySelector('.token.string')).toHaveTextContent('"hello"')
  })

  it('edits code-block languages from the embedded header without changing its code', async () => {
    const onMarkdownChange = vi.fn()
    const source = 'const greeting = "hello"'
    const { container, getByRole } = render(
      <MilkdownEditor initialMarkdown={`\`\`\`\n${source}\n\`\`\``} onMarkdownChange={onMarkdownChange} />,
    )

    const language = await waitFor(() => getByRole('button', { name: 'Code block language: Plain text' }))
    expect(container.querySelector('.code-block-card__content')).toHaveTextContent(source)
    expect(container.querySelector('.code-block-card__language-menu')).toHaveAttribute('hidden')

    fireEvent.click(language)
    fireEvent.click(getByRole('option', { name: 'JavaScript' }))

    await waitFor(() => {
      expect(getByRole('button', { name: 'Code block language: JavaScript' })).toBeVisible()
      expect(onMarkdownChange).toHaveBeenLastCalledWith(`\`\`\`javascript\n${source}\n\`\`\`\n`)
    })
  })

  it('does not send a Markdown document path to the local image protocol', async () => {
    const { container } = render(
      <MilkdownEditor initialMarkdown="![Unexpected document](/Users/example/notes.md)" />,
    )

    await waitFor(() => expect(container.querySelector('.invalid-local-image')).toHaveTextContent('Unexpected document'))
    expect(container.querySelector('img:not(.ProseMirror-separator)')).not.toBeInTheDocument()
  })
})

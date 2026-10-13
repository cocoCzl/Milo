import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MilkdownEditor } from './MilkdownEditor'

afterEach(cleanup)

describe('MilkdownEditor editingLinks', () => {
  it('restores the selected range after link input takes focus', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    fireEvent.keyUp(editor, { key: 'Shift' })

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://milo.example' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() =>
      expect(editor.querySelector('a')).toHaveAttribute('href', 'https://milo.example'),
    )
    expect(editor.querySelector('a')).toHaveTextContent('Select')
    overlayMount.remove()
  })

  it('creates a link for freshly selected ordinary text without changing its paragraph', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="hello world"
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'hello'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('hello'))
    expect(editor.querySelector('p')).toHaveTextContent('hello world')
    expect(editor.querySelectorAll('p')).toHaveLength(1)
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith('[hello](https://example.com) world\n'),
    )
    overlayMount.remove()
  })

  it('creates a link for freshly selected Chinese text in place', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="这是一个测试链接"
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, '这是一个测试链接'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('测试链接'))
    expect(editor.querySelector('p')).toHaveTextContent('这是一个测试链接')
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith(
        '这是一个[测试链接](https://example.com)\n',
      ),
    )
    overlayMount.remove()
  })

  it('serializes a link mark without adding blocks, breaks, or a bare URL', async () => {
    const markdown = 'AJDBC 是 BPK DataBus 的客户端 JDBC 驱动。'
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={markdown}
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'AJDBC'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://www.baidu.com/' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('AJDBC'))
    expect(editor.textContent).toBe(markdown)
    expect(editor.querySelectorAll('p')).toHaveLength(1)
    expect(editor.querySelector('br')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith(
        '[AJDBC](https://www.baidu.com/) 是 BPK DataBus 的客户端 JDBC 驱动。\n',
      ),
    )
    const serialized = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(serialized).not.toContain('<br />')
    expect(serialized).not.toContain('<https://www.baidu.com/>')
    overlayMount.remove()
  })

  it('inserts a link at a collapsed cursor through the Link shortcut', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="before"
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const textInput = await within(overlayMount).findByRole('textbox', { name: 'Link text' })
    fireEvent.change(textInput, { target: { value: '百度' } })
    fireEvent.change(within(overlayMount).getByRole('textbox', { name: 'Link address' }), {
      target: { value: 'https://www.baidu.com/' },
    })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith('before[百度](https://www.baidu.com/)\n'),
    )
    expect(editor.querySelectorAll('p')).toHaveLength(1)
    overlayMount.remove()
  })

  it('turns a pasted HTTP URL into a link at a collapsed cursor', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="before" onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.paste(editor, { clipboardData: { getData: () => 'https://www.baidu.com/' } })
    await waitFor(() =>
      expect(editor.querySelector('a')).toHaveTextContent('https://www.baidu.com/'),
    )
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith('before<https://www.baidu.com/>\n'),
    )
  })

  it('uses a pasted HTTP URL as the href instead of replacing a selected Chinese label', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="百度搜索" onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 2)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.paste(editor, { clipboardData: { getData: () => 'https://www.baidu.com/' } })

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('百度'))
    expect(editor.querySelector('p')).toHaveTextContent('百度搜索')
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith('[百度](https://www.baidu.com/)搜索\n'),
    )
  })

  it('leaves ordinary and unsafe URL paste to the normal editor paste path', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="before" />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    const plainPaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(plainPaste, 'clipboardData', { value: { getData: () => 'hello' } })
    editor.dispatchEvent(plainPaste)

    const unsafePaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(unsafePaste, 'clipboardData', {
      value: { getData: () => 'javascript:alert(1)' },
    })
    editor.dispatchEvent(unsafePaste)
    expect(editor.querySelector('a')).not.toBeInTheDocument()
  })

  it('uses the URL itself as text when Insert Link text is empty', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="before"
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.change(await within(overlayMount).findByRole('textbox', { name: 'Link address' }), {
      target: { value: 'https://www.baidu.com/' },
    })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith('before<https://www.baidu.com/>\n'),
    )
    overlayMount.remove()
  })

  it('opens Insert Link from the contextual menu using the saved collapsed cursor', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container, getByRole } = render(
      <MilkdownEditor
        initialMarkdown="before"
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 'before'.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    fireEvent.contextMenu(editor, { clientX: 120, clientY: 160 })
    fireEvent.click(getByRole('menuitem', { name: /Insert link/ }))
    fireEvent.change(await within(overlayMount).findByRole('textbox', { name: 'Link text' }), {
      target: { value: '百度' },
    })
    fireEvent.change(within(overlayMount).getByRole('textbox', { name: 'Link address' }), {
      target: { value: 'https://www.baidu.com/' },
    })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Insert' }))
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith('before[百度](https://www.baidu.com/)\n'),
    )
    overlayMount.remove()
  })

  it('applies a link to an inline-code selection and serializes the link target', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="`db-auditor`"
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('code')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'db-auditor'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://www.baidu.com' } })
    expect(
      within(overlayMount).queryByRole('button', { name: 'Remove link' }),
    ).not.toBeInTheDocument()
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() =>
      expect(editor.querySelector('a')).toHaveAttribute('href', 'https://www.baidu.com'),
    )
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith('[`db-auditor`](https://www.baidu.com)\n'),
    )
    overlayMount.remove()
  })

  it('updates and removes an existing link without removing its text', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="[hello](https://a.com)"
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('a')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'hello'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    expect(input).toHaveValue('https://a.com')
    expect(within(overlayMount).getByRole('button', { name: 'Remove link' })).toBeVisible()
    fireEvent.change(input, { target: { value: 'https://b.com' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(editor.querySelector('a')).toHaveAttribute('href', 'https://b.com'))
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith('[hello](https://b.com)\n'),
    )

    const updatedText = editor.querySelector('a')!.firstChild!
    const updatedRange = document.createRange()
    updatedRange.setStart(updatedText, 0)
    updatedRange.setEnd(updatedText, 'hello'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(updatedRange)
    fireEvent.mouseUp(editor)
    fireEvent.keyUp(editor, { key: 'Shift' })
    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const remove = await within(overlayMount).findByRole('button', { name: 'Remove link' })
    fireEvent.click(remove)

    await waitFor(() => expect(editor.querySelector('a')).not.toBeInTheDocument())
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('hello\n'))
    overlayMount.remove()
  })

  it('cancels link editing without changing the Markdown document', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="hello"
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'hello'.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    const input = await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.change(input, { target: { value: 'https://discard.example' } })
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Cancel' }))

    expect(editor.querySelector('a')).not.toBeInTheDocument()
    expect(onMarkdownChange).not.toHaveBeenCalled()
    overlayMount.remove()
  })

  it('closes link editing before dismissing the selection toolbar on Escape', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    fireEvent.keyUp(editor, { key: 'Shift' })

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Link' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Link' }))
    await within(overlayMount).findByRole('textbox', { name: 'Link address' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(within(overlayMount).queryByRole('dialog', { name: 'Link' })).not.toBeInTheDocument()
    expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() =>
      expect(
        within(overlayMount).queryByRole('toolbar', { name: 'Formatting' }),
      ).not.toBeInTheDocument(),
    )
    overlayMount.remove()
  })
})

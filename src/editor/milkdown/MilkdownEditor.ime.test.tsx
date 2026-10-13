import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MilkdownEditor } from './MilkdownEditor'

import { proseMirrorDocJSON } from './editorTestFixtures'

afterEach(cleanup)

describe('MilkdownEditor ime', () => {
  it('announces composition synchronously and settles after a final input that follows compositionend', async () => {
    const onCompositionChange = vi.fn()
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="Before"
        onCompositionChange={onCompositionChange}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    fireEvent.compositionStart(editor)
    expect(onCompositionChange).toHaveBeenLastCalledWith({ phase: 'composing' })
    const paragraph = editor.querySelector('p')!
    paragraph.textContent = 'Before ni hao'
    fireEvent.input(editor, { inputType: 'insertCompositionText', isComposing: true })
    fireEvent.compositionEnd(editor, { data: '你好' })
    expect(onCompositionChange).toHaveBeenCalledTimes(1)
    // WKWebView can deliver the final input/DOM replacement after compositionend.
    paragraph.textContent = 'Before 你好'
    fireEvent.input(editor, { inputType: 'insertFromComposition', isComposing: false })
    await waitFor(() =>
      expect(onCompositionChange).toHaveBeenLastCalledWith({
        phase: 'settled',
        markdown: 'Before 你好\n',
      }),
    )
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('Before 你好\n'))
  })

  it('settles a cancelled composition without waiting for a markdown listener event', async () => {
    const onCompositionChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="Confirmed" onCompositionChange={onCompositionChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    fireEvent.compositionStart(editor)
    fireEvent.compositionEnd(editor, { data: '' })
    expect(onCompositionChange).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(onCompositionChange).toHaveBeenLastCalledWith({
        phase: 'settled',
        markdown: 'Confirmed\n',
      }),
    )
  })

  it('keeps a restarted composition blocked and cancels settlement on editor disposal', async () => {
    const onCompositionChange = vi.fn()
    const { container, unmount } = render(
      <MilkdownEditor initialMarkdown="Before" onCompositionChange={onCompositionChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    fireEvent.compositionStart(editor)
    fireEvent.compositionEnd(editor)
    fireEvent.compositionStart(editor)
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
    )
    expect(onCompositionChange.mock.calls).toEqual([[{ phase: 'composing' }]])
    fireEvent.compositionEnd(editor)
    unmount()
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
    )
    expect(onCompositionChange.mock.calls).toEqual([[{ phase: 'composing' }]])
  })

  it('commits a Chinese IME composition without HTML or invisible-character pollution', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown="输入前" onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('p')!.firstChild as Text
    const selection = window.getSelection()!
    const range = document.createRange()
    range.setStart(text, text.data.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    fireEvent.compositionStart(editor, { data: '' })
    text.data += '中文输入'
    fireEvent.input(editor, {
      data: '中文输入',
      inputType: 'insertCompositionText',
      isComposing: true,
    })
    fireEvent.compositionEnd(editor, { data: '中文输入' })

    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved.trimEnd()).toBe('输入前中文输入')
    expect(saved).not.toMatch(/<br\s*\/?>/i)
    expect(saved).not.toContain('\u200b')
    expect(saved).not.toContain('\u00a0')
  })

  it('does not turn Safari composition replacement in an empty paragraph into a hardbreak', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'第一段测试文字\n\n第二段测试文字'}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const firstParagraph = editor.querySelector<HTMLElement>(':scope > p:first-child')!
    const initialRange = document.createRange()
    initialRange.setStart(firstParagraph.firstChild!, 0)
    initialRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(initialRange)
    fireEvent.keyDown(editor, { key: 'Enter' })

    const titleParagraph = editor.querySelector<HTMLElement>(':scope > p:first-child')!
    fireEvent.compositionStart(editor, { data: '' })
    titleParagraph.textContent = 'biao ti'
    const composingText = titleParagraph.firstChild!
    const composingRange = document.createRange()
    composingRange.setStart(composingText, composingText.textContent?.length ?? 0)
    composingRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(composingRange)
    fireEvent.input(editor, {
      data: 'biao ti',
      inputType: 'insertCompositionText',
      isComposing: true,
    })

    fireEvent(
      editor,
      new InputEvent('beforeinput', {
        bubbles: true,
        data: null,
        inputType: 'deleteCompositionText',
        isComposing: true,
      }),
    )
    // WKWebView replaces the entire composing paragraph with a bare BR that is
    // temporarily a direct child of the ProseMirror root. ProseMirror only
    // recreates the paragraph and its trailing-break DOM hack after parsing.
    const artifactBreak = document.createElement('br')
    titleParagraph.replaceWith(artifactBreak)
    const deletionRange = document.createRange()
    deletionRange.setStart(editor, 0)
    deletionRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(deletionRange)

    await waitFor(() =>
      expect(proseMirrorDocJSON(editor)).toEqual({
        type: 'doc',
        content: [
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
        ],
      }),
    )
    fireEvent.input(editor, { data: null, inputType: 'deleteCompositionText', isComposing: true })

    const committedParagraph = editor.querySelector<HTMLElement>(':scope > p:first-child')!
    committedParagraph.innerHTML = '标题<br class="ProseMirror-trailingBreak">'
    const committedText = committedParagraph.firstChild!
    const committedRange = document.createRange()
    committedRange.setStart(committedText, committedText.textContent?.length ?? 0)
    committedRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(committedRange)
    fireEvent(
      editor,
      new InputEvent('beforeinput', {
        bubbles: true,
        data: '标题',
        inputType: 'insertFromComposition',
        isComposing: true,
      }),
    )
    fireEvent.input(editor, { data: '标题', inputType: 'insertFromComposition', isComposing: true })
    fireEvent.compositionEnd(editor, { data: '标题' })

    await waitFor(() =>
      expect(proseMirrorDocJSON(editor)).toEqual({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '标题' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
        ],
      }),
    )
    expect(editor.innerHTML).toBe('<p>标题</p><p>第一段测试文字</p><p>第二段测试文字</p>')
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith(
        '标题\n\n第一段测试文字\n\n第二段测试文字\n',
      ),
    )
  })

  it('preserves an authored Shift+Enter hardbreak through Markdown round-trip', async () => {
    const onMarkdownChange = vi.fn()
    const { container, rerender } = render(
      <MilkdownEditor key="editing" initialMarkdown="第一行" onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const paragraph = editor.querySelector('p')!
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })

    await waitFor(() =>
      expect(proseMirrorDocJSON(editor)).toEqual({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '第一行' },
              { type: 'hardbreak', attrs: { isInline: false } },
            ],
          },
        ],
      }),
    )
    expect(paragraph.innerHTML).toContain('data-type="hardbreak"')

    paragraph.innerHTML = '第一行<br data-type="hardbreak" data-is-inline="false">第二行'
    const secondLine = paragraph.lastChild!
    const secondLineRange = document.createRange()
    secondLineRange.setStart(secondLine, secondLine.textContent?.length ?? 0)
    secondLineRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(secondLineRange)
    fireEvent.input(editor, { data: '第二行', inputType: 'insertText' })

    await waitFor(() =>
      expect(proseMirrorDocJSON(editor)).toEqual({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '第一行' },
              { type: 'hardbreak', attrs: { isInline: false } },
              { type: 'text', text: '第二行' },
            ],
          },
        ],
      }),
    )
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved).toMatch(/^第一行\\\n第二行\n$/)

    rerender(<MilkdownEditor key="reopened" initialMarkdown={saved} />)
    const reopened = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      expect(element).not.toBe(editor)
      return element!
    })
    await waitFor(() =>
      expect(proseMirrorDocJSON(reopened)).toEqual({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '第一行' },
              { type: 'hardbreak', attrs: { isInline: false } },
              { type: 'text', text: '第二行' },
            ],
          },
        ],
      }),
    )
  })

  it('preserves a real br from pasted HTML', async () => {
    const { container } = render(<MilkdownEditor initialMarkdown="" />)
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const paragraph = editor.querySelector('p')!
    const range = document.createRange()
    range.setStart(paragraph, 0)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) =>
          type === 'text/html' ? '<p>第一行<br>第二行</p>' : '第一行\n第二行',
        types: ['text/html', 'text/plain'],
      },
    })
    editor.dispatchEvent(paste)

    await waitFor(() =>
      expect(proseMirrorDocJSON(editor)).toEqual({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '第一行' },
              { type: 'hardbreak', attrs: { isInline: false } },
              { type: 'text', text: '第二行' },
            ],
          },
        ],
      }),
    )
  })

  it('keeps Chinese composition inside a code block as code text', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown={'```\n\n```'} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const code = editor.querySelector<HTMLElement>('.code-block-card__content')!
    fireEvent.compositionStart(code, { data: '' })
    code.textContent = '中文代码'
    const range = document.createRange()
    range.selectNodeContents(code)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.input(code, {
      data: '中文代码',
      inputType: 'insertCompositionText',
      isComposing: true,
    })
    fireEvent.compositionEnd(code, { data: '中文代码' })

    await waitFor(() =>
      expect(proseMirrorDocJSON(editor)).toEqual({
        type: 'doc',
        content: [
          {
            type: 'code_block',
            attrs: { language: '' },
            content: [{ type: 'text', text: '中文代码' }],
          },
        ],
      }),
    )
    await waitFor(() => expect(onMarkdownChange).toHaveBeenLastCalledWith('```\n中文代码\n```\n'))
  })

  it('keeps Chinese composition inside an empty table cell without a hardbreak', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'| 标题 |\n| --- |\n|  |'}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const cellParagraph = editor.querySelector<HTMLElement>('td p')!
    fireEvent.compositionStart(cellParagraph, { data: '' })
    cellParagraph.textContent = '中文单元格'
    const range = document.createRange()
    range.selectNodeContents(cellParagraph)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.input(cellParagraph, {
      data: '中文单元格',
      inputType: 'insertCompositionText',
      isComposing: true,
    })
    fireEvent.compositionEnd(cellParagraph, { data: '中文单元格' })

    await waitFor(() => {
      const json = JSON.stringify(proseMirrorDocJSON(editor))
      expect(json).toContain('中文单元格')
      expect(json).not.toContain('hardbreak')
    })
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toContain('中文单元格')
  })

  it('keeps composition next to linked Chinese text without duplication', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown="[百度](https://www.baidu.com/)"
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const linkText = editor.querySelector('a')!.firstChild as Text
    const range = document.createRange()
    range.setStart(linkText, linkText.data.length)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.compositionStart(editor, { data: '' })
    linkText.data += '标题'
    range.setStart(linkText, linkText.data.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.input(editor, { data: '标题', inputType: 'insertCompositionText', isComposing: true })
    fireEvent.compositionEnd(editor, { data: '标题' })

    await waitFor(() => expect(editor.querySelector('a')).toHaveTextContent('百度标题'))
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith('[百度标题](https://www.baidu.com/)\n'),
    )
    expect(editor.textContent).toBe('百度标题')
    expect(editor.querySelector('br')).not.toBeInTheDocument()
  })
})

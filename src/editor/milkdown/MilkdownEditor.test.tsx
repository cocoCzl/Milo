import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { blockTargetAtPosition } from './blockControls'
import { MilkdownEditor } from './MilkdownEditor'

import { proseMirrorDocJSON, setDOMTextSelection, openBlockMenu } from './editorTestFixtures'

afterEach(cleanup)

describe('MilkdownEditor workspace', () => {
  it.each([4, 5, 6])(
    'converts only the frozen first block to H%i, with history and Markdown round-trip',
    async (level) => {
      const overlayMount = document.body.appendChild(document.createElement('aside'))
      const onMarkdownChange = vi.fn()
      const { container } = render(
        <MilkdownEditor
          initialMarkdown={'第一段\n\n第二段\n\n第三段'}
          contextualOverlayMount={overlayMount}
          onMarkdownChange={onMarkdownChange}
        />,
      )
      const menu = await openBlockMenu(overlayMount)
      const editor = container.querySelector<HTMLElement>('.ProseMirror')!
      const neighbors = Array.from(editor.children)
        .slice(1)
        .map((node) => node.outerHTML)
      fireEvent.pointerEnter(menu.getByRole('menuitem', { name: 'More Headings' }))
      fireEvent.pointerMove(editor.children[1], { clientX: 300, clientY: 220 })
      fireEvent.pointerMove(editor.children[2], { clientX: 300, clientY: 300 })
      fireEvent.click(menu.getByRole('menuitemradio', { name: `Heading ${level}` }))
      await waitFor(() => expect(editor.firstElementChild?.tagName).toBe(`H${level}`))
      expect(
        Array.from(editor.children)
          .slice(1)
          .map((node) => node.outerHTML),
      ).toEqual(neighbors)
      await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
      const saved = onMarkdownChange.mock.calls.at(-1)![0] as string
      expect(saved.trim()).toBe(`${'#'.repeat(level)} 第一段\n\n第二段\n\n第三段`)
      fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
      await waitFor(() => expect(editor.firstElementChild?.tagName).toBe('P'))
      fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
      await waitFor(() => expect(editor.firstElementChild?.tagName).toBe(`H${level}`))
      expect(
        Array.from(editor.children)
          .slice(1)
          .map((node) => node.outerHTML),
      ).toEqual(neighbors)
      const reopened = render(<MilkdownEditor initialMarkdown={saved} />)
      await waitFor(() =>
        expect(reopened.container.querySelector(`h${level}`)).toHaveTextContent('第一段'),
      )
      expect(proseMirrorDocJSON(reopened.container.querySelector('.ProseMirror')!)).toEqual(
        proseMirrorDocJSON(editor),
      )
      reopened.unmount()
      overlayMount.remove()
    },
  )

  it.each([4, 5, 6])(
    'recognizes parsed H%i and supports heading/body conversions without changing neighbors',
    async (initialLevel) => {
      const overlayMount = document.body.appendChild(document.createElement('aside'))
      const { container } = render(
        <MilkdownEditor
          initialMarkdown={`${'#'.repeat(initialLevel)} 标题\n\n第二段\n\n第三段`}
          contextualOverlayMount={overlayMount}
        />,
      )
      let current = initialLevel
      for (const next of [4, 5, 6, 0, 1, 4, 2, 5, 3, 6, 5, 4, 0]) {
        const menu = await openBlockMenu(overlayMount)
        const more = menu.getByRole('menuitem', { name: 'More Headings' })
        fireEvent.click(more)
        const label = current === 0 ? 'Body text' : `Heading ${current}`
        expect(menu.getByRole('menuitemradio', { name: label })).toHaveAttribute(
          'aria-checked',
          'true',
        )
        if (current >= 4) {
          expect(more).toHaveClass('block-menu__more--active')
          expect(menu.getByRole('menuitemradio', { name: 'Body text' })).toHaveAttribute(
            'aria-checked',
            'false',
          )
        }
        fireEvent.click(
          menu.getByRole('menuitemradio', { name: next === 0 ? 'Body text' : `Heading ${next}` }),
        )
        await waitFor(() =>
          expect(container.querySelector('.ProseMirror')?.firstElementChild?.tagName).toBe(
            next ? `H${next}` : 'P',
          ),
        )
        expect(
          Array.from(container.querySelector('.ProseMirror')!.children)
            .slice(1)
            .map((node) => node.outerHTML),
        ).toEqual(['<p>第二段</p>', '<p>第三段</p>'])
        current = next
      }
      overlayMount.remove()
    },
  )

  it('closes both menu levels on Read and does not restore them on Edit', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const props = {
      initialMarkdown: '#### 四级标题\n\n##### 五级标题\n\n###### 六级标题',
      contextualOverlayMount: overlayMount,
    }
    const view = render(<MilkdownEditor {...props} />)
    const menu = await openBlockMenu(overlayMount)
    expect(
      Array.from(view.container.querySelector('.ProseMirror')!.children).map(
        (node) => node.tagName,
      ),
    ).toEqual(['H4', 'H5', 'H6'])
    fireEvent.click(menu.getByRole('menuitem', { name: 'More Headings' }))
    expect(menu.getAllByRole('menu')).toHaveLength(2)
    view.rerender(<MilkdownEditor {...props} presentationMode="read" />)
    await waitFor(() => expect(menu.queryByRole('menu')).not.toBeInTheDocument())
    view.rerender(<MilkdownEditor {...props} presentationMode="edit" />)
    await within(overlayMount).findByRole('button', { name: 'Add block' })
    expect(menu.queryByRole('menu')).not.toBeInTheDocument()
    overlayMount.remove()
  })

  it('serializes and reparses a document containing all three lower heading levels', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const markdown = '#### 四级标题\n\n##### 五级标题\n\n###### 六级标题\n'
    const onMarkdownChange = vi.fn()
    const view = render(
      <MilkdownEditor
        initialMarkdown={markdown}
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    for (const level of [5, 4]) {
      const menu = await openBlockMenu(overlayMount)
      fireEvent.click(menu.getByRole('menuitem', { name: 'More Headings' }))
      fireEvent.click(menu.getByRole('menuitemradio', { name: `Heading ${level}` }))
      await waitFor(() =>
        expect(view.container.querySelector('.ProseMirror')?.firstElementChild?.tagName).toBe(
          `H${level}`,
        ),
      )
    }
    await waitFor(() => expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toBe(markdown))
    const original = proseMirrorDocJSON(view.container.querySelector('.ProseMirror')!)
    view.unmount()
    const reopened = render(
      <MilkdownEditor initialMarkdown={onMarkdownChange.mock.calls.at(-1)![0]} />,
    )
    await waitFor(() =>
      expect(reopened.container.querySelector('h6')).toHaveTextContent('六级标题'),
    )
    expect(
      Array.from(reopened.container.querySelector('.ProseMirror')!.children).map(
        (node) => node.tagName,
      ),
    ).toEqual(['H4', 'H5', 'H6'])
    expect(proseMirrorDocJSON(reopened.container.querySelector('.ProseMirror')!)).toEqual(original)
    overlayMount.remove()
  })

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

  it('switches read mode on the existing ProseMirror instance without remounting it', async () => {
    const { container, rerender } = render(
      <MilkdownEditor initialMarkdown="A stable document" presentationMode="edit" />,
    )
    const proseMirror = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })

    rerender(<MilkdownEditor initialMarkdown="A stable document" presentationMode="read" />)

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBe(proseMirror)
      expect(proseMirror).toHaveAttribute('contenteditable', 'false')
      expect(proseMirror).toHaveAttribute('aria-readonly', 'true')
    })
    expect(container.querySelector('.editor-toolbar')).not.toBeInTheDocument()

    rerender(<MilkdownEditor initialMarkdown="A stable document" presentationMode="edit" />)
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBe(proseMirror)
      expect(proseMirror).toHaveAttribute('contenteditable', 'true')
      expect(proseMirror).toHaveAttribute('aria-readonly', 'false')
    })
  })

  it('shows local selection controls only for a non-empty edit-mode selection', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container, rerender } = render(
      <MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')!
      expect(element).toBeInTheDocument()
      return element
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
      expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible(),
    )
    expect(within(overlayMount).getByRole('button', { name: 'Bold' })).toBeVisible()

    rerender(
      <MilkdownEditor
        initialMarkdown="Select this text"
        contextualOverlayMount={overlayMount}
        presentationMode="read"
      />,
    )
    await waitFor(() =>
      expect(
        within(overlayMount).queryByRole('toolbar', { name: 'Formatting' }),
      ).not.toBeInTheDocument(),
    )
    overlayMount.remove()
  })

  it('keeps the selection toolbar available for an ordinary text selection inside a table cell', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'| A | B |\n| --- | --- |\n| 你好世界 | other |'}
        contextualOverlayMount={overlayMount}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const text = editor.querySelector('td p')!.firstChild as Text
    setDOMTextSelection(text, 0, 2)
    fireEvent.mouseUp(editor)

    await waitFor(() =>
      expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible(),
    )
    expect(editor.querySelectorAll('.selectedCell')).toHaveLength(0)
    overlayMount.remove()
  })

  it('keeps a selected range while applying several contextual inline commands', async () => {
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
      expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Bold' }))
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Italic' }))
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Strikethrough' }))

    await waitFor(() => {
      expect(editor.querySelector('strong')).toHaveTextContent('Select')
      expect(editor.querySelector('em')).toHaveTextContent('Select')
      expect(editor.querySelector('del')).toHaveTextContent('Select')
    })
    overlayMount.remove()
  })

  it('guards task and code-language mutations in read mode while retaining code copy', async () => {
    const { container, getByRole, rerender } = render(
      <MilkdownEditor
        initialMarkdown={'- [ ] Keep read-only\n\n```javascript\nconst stable = true\n```'}
      />,
    )
    const task = await waitFor(() => {
      const item = container.querySelector<HTMLElement>('li[data-item-type="task"]')
      expect(item).toBeInTheDocument()
      return item
    })
    const language = getByRole('button', { name: 'Code block language: JavaScript' })

    rerender(
      <MilkdownEditor
        initialMarkdown={'- [ ] Keep read-only\n\n```javascript\nconst stable = true\n```'}
        presentationMode="read"
      />,
    )

    await waitFor(() => expect(language).toBeDisabled())
    fireEvent.click(task!, { clientX: 0 })
    expect(task).toHaveAttribute('data-checked', 'false')
    expect(getByRole('button', { name: 'Copy' })).not.toBeDisabled()
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
      expect(container.querySelector('.ProseMirror')).toHaveAttribute(
        'aria-label',
        '未命名 Markdown 文档',
      )
    })
    expect(getByText('从一个想法开始…')).toBeVisible()
  })

  it('uses one contextual Block Handle and menu instead of the fixed toolbar', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown="Write here" contextualOverlayMount={overlayMount} />,
    )

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible(),
    )
    expect(container.querySelector('.editor-toolbar')).not.toBeInTheDocument()
    expect(overlayMount.querySelectorAll('.block-handle')).toHaveLength(1)

    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() => expect(container.querySelector('h1')).toHaveTextContent('Write here'))
    overlayMount.remove()
  })

  it('retains Block Handle ownership when the pointer crosses from the editor into its portaled button', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown="Write here" contextualOverlayMount={overlayMount} />,
    )
    const editorRoot = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.milkdown-editor')
      expect(element).toBeInTheDocument()
      return element!
    })
    const handle = await within(overlayMount).findByRole('button', { name: 'Add block' })

    fireEvent(
      editorRoot,
      new MouseEvent('pointerleave', { clientX: 166, clientY: 112, relatedTarget: handle }),
    )
    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBe(handle),
    )
    for (let move = 0; move < 20; move += 1)
      fireEvent.pointerMove(handle, { clientX: 166, clientY: 112 })
    expect(overlayMount.querySelectorAll('.block-handle')).toHaveLength(1)

    fireEvent.click(handle)
    const menu = await within(overlayMount).findByRole('menu', { name: 'Add block' })
    for (let move = 0; move < 20; move += 1)
      fireEvent.pointerMove(menu, { clientX: 180, clientY: 112 })
    expect(overlayMount.querySelector('.block-handle')).toBe(handle)
    expect(overlayMount.querySelector('.block-menu')).toBe(menu)
    overlayMount.remove()
  })

  it('applies Block Menu changes to the empty paragraph being typed in', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown="" contextualOverlayMount={overlayMount} />,
    )

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 1' }))

    await waitFor(() => expect(container.querySelector('.ProseMirror > h1')).toBeInTheDocument())
    overlayMount.remove()
  })

  it('keeps Block Menu transformations in the existing editor history for Undo and Redo', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown="Write here" contextualOverlayMount={overlayMount} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })

    const menu = await openBlockMenu(overlayMount)
    fireEvent.click(menu.getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() => expect(editor.querySelector('h1')).toHaveTextContent('Write here'))

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(editor.querySelector('p')).toHaveTextContent('Write here'))

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(editor.querySelector('h1')).toHaveTextContent('Write here'))
    overlayMount.remove()
  })

  it.each([
    [
      'paragraph',
      '# Write here',
      'Body text',
      (root: HTMLElement) => expect(root.querySelector('p')).toHaveTextContent('Write here'),
    ],
    [
      'heading 1',
      'Write here',
      'Heading 1',
      (root: HTMLElement) => expect(root.querySelector('h1')).toHaveTextContent('Write here'),
    ],
    [
      'heading 2',
      'Write here',
      'Heading 2',
      (root: HTMLElement) => expect(root.querySelector('h2')).toHaveTextContent('Write here'),
    ],
    [
      'heading 3',
      'Write here',
      'Heading 3',
      (root: HTMLElement) => expect(root.querySelector('h3')).toHaveTextContent('Write here'),
    ],
    [
      'quote',
      'Write here',
      'Quote',
      (root: HTMLElement) =>
        expect(root.querySelector('blockquote')).toHaveTextContent('Write here'),
    ],
    [
      'bullet list',
      'Write here',
      'Bulleted list',
      (root: HTMLElement) => expect(root.querySelector('ul')).toHaveTextContent('Write here'),
    ],
    [
      'ordered list',
      'Write here',
      'Numbered list',
      (root: HTMLElement) => expect(root.querySelector('ol')).toHaveTextContent('Write here'),
    ],
    [
      'code block',
      'Write here',
      'Code block',
      (root: HTMLElement) => expect(root.querySelector('pre')).toHaveTextContent('Write here'),
    ],
    [
      'table',
      'Write here',
      'Table',
      (root: HTMLElement) => expect(root.querySelector('table')).toBeInTheDocument(),
    ],
    [
      'divider',
      'Write here',
      'Divider',
      (root: HTMLElement) => expect(root.querySelector('hr')).toBeInTheDocument(),
    ],
  ])(
    'applies %s through the locked Block Menu target without HTML pollution',
    async (_name, markdown, label, assertion) => {
      const directory = mkdtempSync(join(tmpdir(), 'milo-block-menu-'))
      const file = join(directory, 'BLOCK_TEST.md')
      const overlayMount = document.body.appendChild(document.createElement('aside'))
      writeFileSync(file, markdown, 'utf8')
      const onMarkdownChange = vi.fn((next: string) => writeFileSync(file, next, 'utf8'))
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
      onMarkdownChange.mockClear()
      const menu = await openBlockMenu(overlayMount)
      fireEvent.click(
        menu.getByRole(label === 'Table' || label === 'Divider' ? 'menuitem' : 'menuitemradio', {
          name: label,
        }),
      )

      await waitFor(() => assertion(editor))
      await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
      const saved = readFileSync(file, 'utf8')
      expect(saved).not.toContain('<br')
      expect(saved).not.toMatch(/^\\$/m)
      expect(saved).not.toMatch(/<[^>]+>/)
      const reopened = render(<MilkdownEditor initialMarkdown={saved} />)
      const reopenedEditor = await waitFor(() => {
        const element = reopened.container.querySelector<HTMLElement>('.ProseMirror')
        expect(element).toBeInTheDocument()
        return element!
      })
      assertion(reopenedEditor)
      reopened.unmount()
      overlayMount.remove()
      rmSync(directory, { recursive: true, force: true })
    },
  )

  it('keeps Block Menu open on its frozen block and cancels without document or disk changes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'milo-block-menu-cancel-'))
    const file = join(directory, 'BLOCK_TEST.md')
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const baseline = 'First block\n\nSecond block'
    writeFileSync(file, baseline, 'utf8')
    const onMarkdownChange = vi.fn((next: string) => writeFileSync(file, next, 'utf8'))
    const { container } = render(
      <MilkdownEditor
        editorId="block-test-tab"
        initialMarkdown={baseline}
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeInTheDocument())
    onMarkdownChange.mockClear()
    const menu = await openBlockMenu(overlayMount)
    const firstMenu = menu.getByRole('menu', { name: 'Add block' })
    const frozenTop = firstMenu.style.top
    fireEvent.pointerMove(container.querySelector('.milkdown-editor')!, {
      clientX: 0,
      clientY: 300,
    })
    expect(menu.getByRole('menu', { name: 'Add block' }).style.top).toBe(frozenTop)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(overlayMount.querySelector('.block-menu')).not.toBeInTheDocument())
    expect(onMarkdownChange).not.toHaveBeenCalled()
    expect(readFileSync(file, 'utf8')).toBe(baseline)

    const reopenedMenu = await openBlockMenu(overlayMount)
    fireEvent.pointerDown(document.body)
    await waitFor(() =>
      expect(reopenedMenu.queryByRole('menu', { name: 'Add block' })).not.toBeInTheDocument(),
    )
    expect(onMarkdownChange).not.toHaveBeenCalled()
    expect(readFileSync(file, 'utf8')).toBe(baseline)
    overlayMount.remove()
    rmSync(directory, { recursive: true, force: true })
  })

  it('applies a Block Menu command to its frozen block rather than a later pointer target', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'First block\n\nSecond block'}
        contextualOverlayMount={overlayMount}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const menu = await openBlockMenu(overlayMount)

    // The menu already owns the first block. Pointer movement must not make
    // its command infer a new target from the DOM under the pointer.
    fireEvent.pointerMove(container.querySelector('.milkdown-editor')!, {
      clientX: 0,
      clientY: 400,
    })
    fireEvent.click(menu.getByRole('menuitemradio', { name: 'Heading 2' }))

    await waitFor(() => expect(editor.querySelector('h2')).toHaveTextContent('First block'))
    expect(editor.querySelectorAll('p')[0]).toHaveTextContent('Second block')
    overlayMount.remove()
  })

  it('inserts exactly one divider after a table without duplicating the table, and keeps one-step Undo/Redo', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const source = '| A | B |\n| :- | :- |\n| 1 | 2 |'
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={source}
        contextualOverlayMount={overlayMount}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const cell = editor.querySelector('td p')!
    const range = document.createRange()
    range.selectNodeContents(cell)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)
    const menu = await openBlockMenu(overlayMount)
    fireEvent.click(menu.getByRole('menuitem', { name: 'Divider' }))

    await waitFor(() => expect(editor.querySelectorAll('table')).toHaveLength(1))
    expect(editor.querySelectorAll('hr')).toHaveLength(1)
    const landingParagraph = editor.querySelector<HTMLElement>(':scope > p:last-child')
    const selection = window.getSelection()
    expect(landingParagraph).toBeInTheDocument()
    expect(document.activeElement).toBe(editor)
    expect(
      selection?.anchorNode === landingParagraph ||
        landingParagraph?.contains(selection?.anchorNode ?? null),
    ).toBe(true)
    expect(selection?.anchorOffset).toBe(0)
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith(expect.stringContaining('***')),
    )
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved).not.toContain('<br')
    expect(saved).not.toMatch(/^\\$/m)
    expect(saved).not.toContain('\u200b')
    expect(saved).not.toContain('\u00a0')

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(editor.querySelectorAll('hr')).toHaveLength(0))
    expect(editor.querySelectorAll('table')).toHaveLength(1)
    expect(editor.querySelector(':scope > p:last-child')).not.toBeInTheDocument()
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(editor.querySelectorAll('hr')).toHaveLength(1))
    expect(editor.querySelectorAll('table')).toHaveLength(1)

    const restoredParagraph = editor.querySelector<HTMLElement>(':scope > p:last-child')!
    const restoredSelection = window.getSelection()
    expect(
      restoredSelection?.anchorNode === restoredParagraph ||
        restoredParagraph.contains(restoredSelection?.anchorNode ?? null),
    ).toBe(true)
    expect(restoredSelection?.anchorOffset).toBe(0)
    restoredParagraph.textContent = 'Divider 后正文'
    const typedRange = document.createRange()
    typedRange.selectNodeContents(restoredParagraph)
    typedRange.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(typedRange)
    fireEvent.input(editor, { data: 'Divider 后正文', inputType: 'insertText' })
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith(expect.stringContaining('Divider 后正文')),
    )
    const savedWithBody = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(savedWithBody).not.toMatch(/<br\s*\/?>|^\\$/m)
    expect(savedWithBody).not.toContain('\u200b')
    expect(savedWithBody).not.toContain('\u00a0')
    const reopened = render(<MilkdownEditor initialMarkdown={savedWithBody} />)
    await waitFor(() => expect(reopened.container.querySelectorAll('table')).toHaveLength(1))
    expect(reopened.container.querySelectorAll('hr')).toHaveLength(1)
    expect(reopened.container.querySelector('.ProseMirror > p:last-child')).toHaveTextContent(
      'Divider 后正文',
    )
    reopened.unmount()
    overlayMount.remove()
  })

  it.each([
    ['table', '| A |\n| :- |\n| 1 |', 'td p', 'table'],
    ['code block', '```\ncode\n```', '.code-block-card__content', 'pre'],
  ])(
    'deletes a %s through Block Menu in one undoable ProseMirror transaction',
    async (_name, source, selector, blockSelector) => {
      const overlayMount = document.body.appendChild(document.createElement('aside'))
      const onMarkdownChange = vi.fn()
      const { container } = render(
        <MilkdownEditor
          initialMarkdown={source}
          contextualOverlayMount={overlayMount}
          onMarkdownChange={onMarkdownChange}
        />,
      )
      const editor = await waitFor(() => {
        const element = container.querySelector<HTMLElement>('.ProseMirror')
        expect(element).toBeInTheDocument()
        return element!
      })
      const content = await waitFor(() => {
        const element = editor.querySelector<HTMLElement>(selector)
        expect(element).toBeInTheDocument()
        return element!
      })
      const range = document.createRange()
      range.selectNodeContents(content)
      range.collapse(true)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      fireEvent.mouseUp(editor)
      const menu = await openBlockMenu(overlayMount)
      fireEvent.click(menu.getByRole('menuitem', { name: 'Delete block' }))
      await waitFor(() => expect(editor.querySelector(blockSelector)).not.toBeInTheDocument())
      expect(editor.querySelectorAll('p')).toHaveLength(1)
      await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
      expect(onMarkdownChange.mock.calls.at(-1)?.[0]).not.toMatch(/<br\s*\/?>|^\\$/m)
      fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
      await waitFor(() => expect(editor.querySelector(blockSelector)).toBeInTheDocument())
      fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
      await waitFor(() => expect(editor.querySelector(blockSelector)).not.toBeInTheDocument())
      overlayMount.remove()
    },
  )

  it.each([['h1'], ['h2'], ['h3']])(
    'keeps %s text and type when Enter is pressed at its start',
    async (tag) => {
      const { container } = render(
        <MilkdownEditor initialMarkdown={`${'#'.repeat(Number(tag.at(-1)))} Heading`} />,
      )
      const editor = await waitFor(() => {
        const element = container.querySelector<HTMLElement>('.ProseMirror')
        expect(element).toBeInTheDocument()
        return element!
      })
      const heading = editor.querySelector<HTMLElement>(tag)!
      const text = heading.firstChild!
      const range = document.createRange()
      range.setStart(text, 0)
      range.collapse(true)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      fireEvent.keyDown(editor, { key: 'Enter' })
      await waitFor(() => {
        expect(editor.querySelector(`p + ${tag}`)).toHaveTextContent('Heading')
        expect(editor.querySelector('p')?.textContent).toBe('')
      })
    },
  )

  it('splits a paragraph at offset zero into an independently formattable block', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        contextualOverlayMount={overlayMount}
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
    expect(proseMirrorDocJSON(editor)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
      ],
    })
    expect(editor.innerHTML).toBe('<p>第一段测试文字</p><p>第二段测试文字</p>')
    const range = document.createRange()
    range.setStart(firstParagraph.firstChild!, 0)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.keyDown(editor, { key: 'Enter' })

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
    expect(editor.innerHTML).toBe(
      '<p><br class="ProseMirror-trailingBreak"></p><p>第一段测试文字</p><p>第二段测试文字</p>',
    )

    const titleParagraph = editor.querySelector<HTMLElement>(':scope > p:first-child')!
    titleParagraph.textContent = '标题'
    const titleRange = document.createRange()
    titleRange.selectNodeContents(titleParagraph)
    titleRange.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(titleRange)
    fireEvent.input(editor, { data: '标题', inputType: 'insertText' })

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

    const pmDoc = (
      editor as HTMLElement & {
        pmViewDesc?: {
          node?: {
            forEach: (
              callback: (
                node: { type: { name: string }; nodeSize: number },
                offset: number,
              ) => void,
            ) => void
          }
        }
      }
    ).pmViewDesc?.node
    expect(pmDoc).toBeDefined()
    const blocks: Array<{ position: number; type: string; nodeSize: number }> = []
    pmDoc?.forEach((node, position) =>
      blocks.push({ position, type: node.type.name, nodeSize: node.nodeSize }),
    )
    expect(blocks).toEqual([
      { position: 0, type: 'paragraph', nodeSize: 4 },
      { position: 4, type: 'paragraph', nodeSize: 9 },
      { position: 13, type: 'paragraph', nodeSize: 9 },
    ])
    const blockElements = Array.from(editor.children)
    const fakeView = {
      state: { doc: pmDoc },
      nodeDOM: (position: number) =>
        blockElements[blocks.findIndex((block) => block.position === position)] ?? null,
      domAtPos: () => ({ node: editor }),
    } as unknown as Parameters<typeof blockTargetAtPosition>[0]
    expect(
      blocks.map(
        (block) =>
          blockTargetAtPosition(fakeView, 'standalone', block.position + 1)?.targetBlockPosition,
      ),
    ).toEqual([0, 4, 13])

    fireEvent.click(await within(overlayMount).findByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() =>
      expect(proseMirrorDocJSON(editor)).toEqual({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { id: '标题', level: 1 },
            content: [{ type: 'text', text: '标题' }],
          },
          { type: 'paragraph', content: [{ type: 'text', text: '第一段测试文字' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
        ],
      }),
    )

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    await waitFor(() =>
      expect(Array.from(editor.children).map((node) => node.tagName)).toEqual(['P', 'P']),
    )
    expect(editor.children[0]).toHaveTextContent('第一段测试文字')
    expect(editor.children[1]).toHaveTextContent('第二段测试文字')
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() =>
      expect(Array.from(editor.children).map((node) => node.tagName)).toEqual(['H1', 'P', 'P']),
    )
    expect(editor.children[0]).toHaveTextContent('标题')
    expect(editor.children[1]).toHaveTextContent('第一段测试文字')
    expect(editor.children[2]).toHaveTextContent('第二段测试文字')

    const firstBodyParagraph = editor.querySelector<HTMLElement>(':scope > p')!
    const bodyRange = document.createRange()
    bodyRange.setStart(firstBodyParagraph.firstChild!, 0)
    bodyRange.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(bodyRange)
    fireEvent.mouseUp(editor)
    fireEvent.click(await within(overlayMount).findByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 2' }))
    await waitFor(() =>
      expect(proseMirrorDocJSON(editor)).toEqual({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { id: '标题', level: 1 },
            content: [{ type: 'text', text: '标题' }],
          },
          {
            type: 'heading',
            attrs: { id: '第一段测试文字', level: 2 },
            content: [{ type: 'text', text: '第一段测试文字' }],
          },
          { type: 'paragraph', content: [{ type: 'text', text: '第二段测试文字' }] },
        ],
      }),
    )
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith(
        '# 标题\n\n## 第一段测试文字\n\n第二段测试文字\n',
      ),
    )
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved).not.toMatch(/<br\s*\/?>|^\\$/m)
    expect(saved).not.toContain('\u200b')
    expect(saved).not.toContain('\u00a0')

    const reopened = render(<MilkdownEditor initialMarkdown={saved} />)
    const reopenedEditor = await waitFor(() => {
      const element = reopened.container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    expect(Array.from(reopenedEditor.children).map((node) => node.tagName)).toEqual([
      'H1',
      'H2',
      'P',
    ])
    expect(reopenedEditor.children[0]).toHaveTextContent('标题')
    expect(reopenedEditor.children[1]).toHaveTextContent('第一段测试文字')
    expect(reopenedEditor.children[2]).toHaveTextContent('第二段测试文字')
    reopened.unmount()
    overlayMount.remove()
  })

  it('closes a tab’s Block Menu and discards its target when that tab becomes inactive', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const view = render(
      <>
        <MilkdownEditor
          active
          editorId="tab-a"
          initialMarkdown="Tab A"
          contextualOverlayMount={overlayMount}
        />
        <MilkdownEditor
          active={false}
          editorId="tab-b"
          initialMarkdown="Tab B"
          contextualOverlayMount={overlayMount}
        />
      </>,
    )
    const firstHandle = await within(overlayMount).findByRole('button', { name: 'Add block' })
    fireEvent.click(firstHandle)
    await within(overlayMount).findByRole('menu', { name: 'Add block' })

    fireEvent.click(within(overlayMount).getByRole('menuitem', { name: 'More Headings' }))
    expect(within(overlayMount).getByRole('menu', { name: 'More Headings' })).toBeInTheDocument()

    view.rerender(
      <>
        <MilkdownEditor
          active={false}
          editorId="tab-a"
          initialMarkdown="Tab A"
          contextualOverlayMount={overlayMount}
        />
        <MilkdownEditor
          active
          editorId="tab-b"
          initialMarkdown="Tab B"
          contextualOverlayMount={overlayMount}
        />
      </>,
    )

    await waitFor(() => expect(overlayMount.querySelector('.block-menu')).not.toBeInTheDocument())
    const secondHandle = await within(overlayMount).findByRole('button', { name: 'Add block' })
    expect(secondHandle).not.toBe(firstHandle)
    fireEvent.click(secondHandle)
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 3' }))
    await waitFor(() =>
      expect(
        view.container.querySelectorAll('.ProseMirror')[1].querySelector('h3'),
      ).toHaveTextContent('Tab B'),
    )
    expect(view.container.querySelectorAll('.ProseMirror')[0].querySelector('p')).toHaveTextContent(
      'Tab A',
    )
    view.rerender(
      <>
        <MilkdownEditor
          active
          editorId="tab-a"
          initialMarkdown="Tab A"
          contextualOverlayMount={overlayMount}
        />
        <MilkdownEditor
          active={false}
          editorId="tab-b"
          initialMarkdown="Tab B"
          contextualOverlayMount={overlayMount}
        />
      </>,
    )
    await waitFor(() => expect(within(overlayMount).queryByRole('menu')).not.toBeInTheDocument())
    overlayMount.remove()
  })

  it('keeps Block Handle and Selection Toolbar mutually exclusive across edit, read, and inactive states', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container, rerender } = render(
      <MilkdownEditor initialMarkdown="Select this text" contextualOverlayMount={overlayMount} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible(),
    )
    const text = editor.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.mouseUp(editor)

    await waitFor(() =>
      expect(within(overlayMount).getByRole('toolbar', { name: 'Formatting' })).toBeVisible(),
    )
    expect(
      within(overlayMount).queryByRole('button', { name: 'Add block' }),
    ).not.toBeInTheDocument()

    rerender(
      <MilkdownEditor
        initialMarkdown="Select this text"
        contextualOverlayMount={overlayMount}
        presentationMode="read"
      />,
    )
    await waitFor(() =>
      expect(
        within(overlayMount).queryByRole('button', { name: 'Add block' }),
      ).not.toBeInTheDocument(),
    )
    rerender(
      <MilkdownEditor
        active={false}
        initialMarkdown="Select this text"
        contextualOverlayMount={overlayMount}
      />,
    )
    expect(
      within(overlayMount).queryByRole('button', { name: 'Add block' }),
    ).not.toBeInTheDocument()
    overlayMount.remove()
  })

  it('inserts a body paragraph before an empty heading when Enter is pressed at its start', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown="" contextualOverlayMount={overlayMount} />,
    )

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })
    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 1' }))
    await waitFor(() => expect(container.querySelector('.ProseMirror > h1')).toBeInTheDocument())

    fireEvent.keyDown(editor!, { key: 'Enter' })

    await waitFor(() => {
      const paragraph = container.querySelector('.ProseMirror > p + h1')?.previousElementSibling
      const selection = window.getSelection()

      expect(paragraph).toBeInTheDocument()
      expect(container.querySelector('.ProseMirror > h1')).toBeInTheDocument()
      expect(
        selection?.anchorNode === paragraph || paragraph?.contains(selection?.anchorNode ?? null),
      ).toBe(true)
      expect(selection?.anchorOffset).toBe(0)
    })
    overlayMount.remove()
  })

  it.each([
    ['H1', '#'],
    ['H2', '##'],
    ['H3', '###'],
  ])('creates exactly one paragraph before %s at heading-start Enter', async (_name, marker) => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown={`${marker} 你好`} onMarkdownChange={onMarkdownChange} />,
    )

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })
    const heading = editor!.querySelector(`h${marker.length}`)
    const range = document.createRange()
    range.setStart(heading!.firstChild!, 0)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    fireEvent.keyDown(editor!, { key: 'Enter' })

    await waitFor(() => {
      const paragraph = editor!.querySelector<HTMLElement>(`:scope > p:first-child`)
      expect(editor!.querySelector(`h${marker.length}`)).toHaveTextContent('你好')
      expect(paragraph).toBeInTheDocument()
      expect(document.activeElement).toBe(editor)
      expect(
        window.getSelection()?.anchorNode === paragraph ||
          paragraph?.contains(window.getSelection()?.anchorNode ?? null),
      ).toBe(true)
      expect(window.getSelection()?.anchorOffset).toBe(0)
    })

    const paragraph = editor!.querySelector<HTMLElement>(':scope > p:first-child')!
    paragraph.textContent = '你啊红'
    const typedRange = document.createRange()
    typedRange.selectNodeContents(paragraph)
    typedRange.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(typedRange)
    fireEvent.input(editor!, { data: '你啊红', inputType: 'insertText' })

    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith(`你啊红\n\n${marker} 你好\n`),
    )
    expect(proseMirrorDocJSON(editor!)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '你啊红' }] },
        {
          type: 'heading',
          attrs: { id: '你好', level: marker.length },
          content: [{ type: 'text', text: '你好' }],
        },
      ],
    })
    const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
    expect(saved).not.toMatch(/<br\s*\/?>|^\\$/m)
    expect(saved).not.toContain('\u200b')
    expect(saved).not.toContain('\u00a0')
    const reopened = render(<MilkdownEditor initialMarkdown={saved} />)
    const reopenedEditor = await waitFor(() => {
      const element = reopened.container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    expect(Array.from(reopenedEditor.children).map((node) => node.tagName)).toEqual([
      'P',
      `H${marker.length}`,
    ])
    expect(reopenedEditor.querySelector(':scope > p')).toHaveTextContent('你啊红')
    expect(reopenedEditor.querySelector(`:scope > h${marker.length}`)).toHaveTextContent('你好')
    reopened.unmount()

    fireEvent.keyDown(editor!, { key: 'z', ctrlKey: true })
    await waitFor(() =>
      expect(editor!.querySelector(':scope > p:first-child')).not.toBeInTheDocument(),
    )
    expect(editor!.querySelector(`h${marker.length}`)).toHaveTextContent('你好')
    fireEvent.keyDown(editor!, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() =>
      expect(editor!.querySelector(':scope > p:first-child')).toHaveTextContent('你啊红'),
    )
  })

  it.each([
    ['code block', '```text\nconst ready = true\n```', '.code-block-card__content', 'pre'],
    ['table', '| A | B |\n| :- | :- |\n| 1 | 2 |', 'td p', 'table'],
  ])(
    'keeps a visible, focused caret when Cmd+Enter exits a %s',
    async (_name, source, contentSelector, blockSelector) => {
      const onMarkdownChange = vi.fn()
      const { container } = render(
        <MilkdownEditor initialMarkdown={source} onMarkdownChange={onMarkdownChange} />,
      )
      const editor = await waitFor(() => {
        const element = container.querySelector<HTMLElement>('.ProseMirror')
        expect(element).toBeInTheDocument()
        return element!
      })
      const content = await waitFor(() => {
        const element = editor.querySelector<HTMLElement>(contentSelector)
        expect(element).toBeInTheDocument()
        return element!
      })
      const range = document.createRange()
      range.selectNodeContents(content)
      range.collapse(false)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)

      fireEvent.keyDown(editor, { key: 'Enter', metaKey: true })

      const paragraph = await waitFor(() => {
        const element = editor.querySelector<HTMLElement>(':scope > p:last-child')
        const selection = window.getSelection()
        expect(element).toBeInTheDocument()
        expect(document.activeElement).toBe(editor)
        expect(selection?.isCollapsed).toBe(true)
        expect(
          selection?.anchorNode === element || element?.contains(selection?.anchorNode ?? null),
        ).toBe(true)
        expect(selection?.anchorOffset).toBe(0)
        return element!
      })

      paragraph.textContent = '继续写'
      const text = paragraph.firstChild!
      const typedRange = document.createRange()
      typedRange.setStart(text, text.textContent?.length ?? 0)
      typedRange.collapse(true)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(typedRange)
      fireEvent.input(editor, { data: '继续写', inputType: 'insertText' })

      await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled())
      const saved = onMarkdownChange.mock.calls.at(-1)?.[0] as string
      expect(saved).toContain('继续写')
      expect(saved).not.toMatch(/<br\s*\/?>/i)
      expect(saved).not.toMatch(/^\\$/m)
      expect(saved).not.toContain('\u200b')
      expect(saved).not.toContain('\u00a0')
      expect(editor.querySelector(blockSelector)).toBeInTheDocument()

      fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
      await waitFor(() =>
        expect(editor.querySelector(':scope > p:last-child')).not.toBeInTheDocument(),
      )
      expect(editor.querySelector(blockSelector)).toBeInTheDocument()
      fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true })
      await waitFor(() =>
        expect(editor.querySelector(':scope > p:last-child')).toHaveTextContent('继续写'),
      )
    },
  )

  it('formats the block under the visible cursor instead of the previous heading', async () => {
    const overlayMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown={'# 标题\n\n正文'} contextualOverlayMount={overlayMount} />,
    )

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

    await waitFor(() =>
      expect(within(overlayMount).getByRole('button', { name: 'Add block' })).toBeVisible(),
    )
    fireEvent.click(within(overlayMount).getByRole('button', { name: 'Add block' }))
    fireEvent.click(within(overlayMount).getByRole('menuitemradio', { name: 'Heading 2' }))

    await waitFor(() => {
      expect(editor!.querySelector('h1')).toHaveTextContent('标题')
      expect(editor!.querySelector('h2')).toHaveTextContent('正文')
    })
    overlayMount.remove()
  })

  it('replaces the WebView menu with localized editing commands', async () => {
    const copy = {
      bold: '粗体',
      copy: '复制',
      cut: '剪切',
      italic: '斜体',
      selectAll: '全选',
    }
    const { container, getByRole, queryByRole } = render(
      <MilkdownEditor copy={copy} initialMarkdown="右键编辑" />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element
    })

    fireEvent.contextMenu(editor!, { clientX: 120, clientY: 160 })

    expect(getByRole('menu')).toBeVisible()
    expect(getByRole('menuitem', { name: /复制/ })).toBeInTheDocument()
    expect(queryByRole('menuitem', { name: /粘贴/ })).not.toBeInTheDocument()
    expect(queryByRole('menuitem', { name: /^Copy/ })).not.toBeInTheDocument()
  })

  it('restores editor focus on Context Menu Escape and closes outside without changing Markdown', async () => {
    const onMarkdownChange = vi.fn()
    const { container, getByRole, queryByRole } = render(
      <MilkdownEditor initialMarkdown="Stable paragraph" onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    onMarkdownChange.mockClear()

    fireEvent.contextMenu(editor, { clientX: 120, clientY: 160 })
    const firstEnabled = getByRole('menuitem', { name: /Bold/ })
    expect(firstEnabled).toHaveFocus()
    fireEvent.keyDown(firstEnabled, { key: 'Escape' })
    await waitFor(() => expect(queryByRole('menu')).not.toBeInTheDocument())
    expect(editor).toHaveFocus()
    expect(onMarkdownChange).not.toHaveBeenCalled()

    fireEvent.contextMenu(editor, { clientX: 120, clientY: 160 })
    expect(getByRole('menu')).toBeVisible()
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(queryByRole('menu')).not.toBeInTheDocument())
    expect(onMarkdownChange).not.toHaveBeenCalled()
    expect(editor).toHaveTextContent('Stable paragraph')
  })

  it('leaves the native contextmenu event untouched in Read Mode', async () => {
    const { container, queryByRole } = render(
      <MilkdownEditor initialMarkdown="Readable paragraph" presentationMode="read" />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })

    expect(fireEvent.contextMenu(editor, { clientX: 120, clientY: 160 })).toBe(true)
    expect(queryByRole('menu')).not.toBeInTheDocument()
  })

  it.each([
    ['paragraph', 'Copy paragraph text', 'p'],
    ['table cell', '| A | B |\n| --- | --- |\n| Copy cell text | Value |', 'td p'],
    ['code block', '```java\nString text = "Copy code text";\n```', '.code-block-card__content'],
  ])(
    'dispatches clipboard commands through the existing browser path for %s TextSelection',
    async (_name, markdown, selector) => {
      const originalExecCommand = document.execCommand
      const execCommand = vi.fn(() => true)
      Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
      try {
        const { container, getByRole } = render(<MilkdownEditor initialMarkdown={markdown} />)
        const editor = await waitFor(() => {
          const element = container.querySelector<HTMLElement>('.ProseMirror')
          expect(element).toBeInTheDocument()
          return element!
        })
        const content = await waitFor(() => {
          const element = editor.querySelector<HTMLElement>(selector)
          expect(element).toBeInTheDocument()
          return element!
        })
        const text = content.textContent ? content.firstChild! : content
        const selectContent = () => {
          const range = document.createRange()
          range.selectNodeContents(text)
          window.getSelection()?.removeAllRanges()
          window.getSelection()?.addRange(range)
          fireEvent.mouseUp(editor)
        }

        selectContent()
        fireEvent.contextMenu(content, { clientX: 120, clientY: 160 })
        expect(getByRole('menu')).not.toHaveTextContent('Paste')
        fireEvent.click(getByRole('menuitem', { name: /Copy/ }))
        expect(execCommand).toHaveBeenLastCalledWith('copy')

        selectContent()
        fireEvent.contextMenu(content, { clientX: 120, clientY: 160 })
        fireEvent.click(getByRole('menuitem', { name: /Cut/ }))
        expect(execCommand).toHaveBeenLastCalledWith('cut')
      } finally {
        Object.defineProperty(document, 'execCommand', {
          configurable: true,
          value: originalExecCommand,
        })
      }
    },
  )
})

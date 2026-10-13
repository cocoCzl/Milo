import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { NodeSelection, TextSelection } from '@milkdown/prose/state'

import { MilkdownEditor } from './MilkdownEditor'

import {
  proseMirrorDocJSON,
  localImageNodeViewTestHarness,
  imageSelectionTestView,
} from './editorTestFixtures'

afterEach(cleanup)

describe('MilkdownEditor images', () => {
  it('keeps remote images unloaded until the author explicitly requests one', async () => {
    const { container, getByRole } = render(
      <MilkdownEditor initialMarkdown="![A remote illustration](https://images.example.test/quiet.png)" />,
    )

    const button = await waitFor(() =>
      getByRole('button', { name: 'Load remote image: A remote illustration' }),
    )
    expect(container.querySelector('img[src^="https://"]')).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Loading image…')
  })

  it('syncs non-empty local image titles and removes an empty runtime title', () => {
    const { imageNode, view } = localImageNodeViewTestHarness('diagram.png', 'Diagram', 'Schema A')
    const root = view.dom as HTMLElement

    expect(root.querySelector('img')).toHaveAttribute('title', 'Schema A')
    expect(view.update?.(imageNode('diagram.png', 'Diagram', 'Schema B'), [], {} as never)).toBe(
      true,
    )
    expect(root.querySelector('img')).toHaveAttribute('title', 'Schema B')
    expect(view.update?.(imageNode('diagram.png', 'Diagram', ''), [], {} as never)).toBe(true)
    expect(root.querySelector('img')).not.toHaveAttribute('title')
    expect(view.update?.(imageNode('diagram.png', 'Diagram', null), [], {} as never)).toBe(true)
    expect(root.querySelector('img')).not.toHaveAttribute('title')
    view.destroy?.()
  })

  it('syncs remote loaded image alt and title without reloading the source', () => {
    const createdImages: HTMLImageElement[] = []
    const createElement = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      const element = createElement(tagName, options)
      if (tagName.toLowerCase() === 'img') createdImages.push(element as HTMLImageElement)
      return element
    }) as typeof document.createElement)

    try {
      const { imageNode, view } = localImageNodeViewTestHarness(
        'https://images.example.test/diagram.png',
        'Remote diagram',
        'Remote A',
      )
      const root = view.dom as HTMLElement
      const button = root.querySelector('button')!
      fireEvent.click(button)
      const image = createdImages.at(-1)!

      expect(root).toHaveClass('remote-image-view')
      expect(image).toHaveAttribute('alt', 'Remote diagram')
      expect(image).toHaveAttribute('title', 'Remote A')
      fireEvent.load(image)
      expect(root.querySelector('img')).toBe(image)

      expect(
        view.update?.(
          imageNode('https://images.example.test/diagram.png', 'Updated diagram', 'Remote B'),
          [],
          {} as never,
        ),
      ).toBe(true)
      expect(image).toHaveAttribute('alt', 'Updated diagram')
      expect(image).toHaveAttribute('title', 'Remote B')
      expect(
        view.update?.(
          imageNode('https://images.example.test/diagram.png', 'Updated diagram', ''),
          [],
          {} as never,
        ),
      ).toBe(true)
      expect(image).not.toHaveAttribute('title')
      expect(
        view.update?.(
          imageNode('https://images.example.test/diagram.png', 'Updated diagram', null),
          [],
          {} as never,
        ),
      ).toBe(true)
      expect(image).not.toHaveAttribute('title')
      expect(createdImages).toHaveLength(1)
      view.destroy?.()
    } finally {
      createElementSpy.mockRestore()
    }
  })

  it('uses the stable image root for NodeSelection without changing the document', () => {
    const { mount, transactions, view } = imageSelectionTestView()
    try {
      const before = view.state.doc
      const root = view.dom.querySelector<HTMLElement>('.local-image-view')!

      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 1)))
      expect(root).toHaveClass('ProseMirror-selectednode')
      expect(view.state.doc.eq(before)).toBe(true)
      expect(transactions).toEqual([0])

      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)))
      expect(root).not.toHaveClass('ProseMirror-selectednode')
      expect(view.state.doc.eq(before)).toBe(true)
      expect(transactions).toEqual([0, 0])
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it.each([
    ['error', 'missing.png'],
    ['empty', ''],
  ])('keeps the %s image placeholder selected through its stable image root', (state, source) => {
    const { mount, view } = imageSelectionTestView(source)
    try {
      const root = view.dom.querySelector<HTMLElement>('.local-image-view')!
      if (state === 'error') fireEvent.error(root.querySelector('img')!)
      expect(root.querySelector('.local-image-placeholder')).toHaveAttribute(
        'data-image-state',
        state,
      )

      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 1)))
      expect(root).toHaveClass('ProseMirror-selectednode')
      expect(root.querySelector('.local-image-placeholder')).toBeInTheDocument()
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('keeps a broken local image node and Markdown intact when loading fails', async () => {
    const markdown = '![Broken alt](missing.png "Broken title")\n\nAfter\n'
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor
        documentPath="/documents/note.md"
        initialMarkdown={markdown}
        onMarkdownChange={onMarkdownChange}
      />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const image = await waitFor(() => {
      const element = container.querySelector<HTMLImageElement>('.local-image-view img')
      expect(element).toBeInTheDocument()
      return element!
    })
    const before = proseMirrorDocJSON(editor)
    const updateCount = onMarkdownChange.mock.calls.length

    fireEvent.error(image)

    await waitFor(() =>
      expect(
        container.querySelector('.local-image-placeholder[data-image-state="error"]'),
      ).toHaveTextContent('Broken alt'),
    )
    expect(
      container.querySelector('.local-image-placeholder[data-image-state="error"]'),
    ).toHaveTextContent('Could not load image')
    expect(proseMirrorDocJSON(editor)).toEqual(before)
    const documentJson = proseMirrorDocJSON(editor) as { content: unknown[] }
    expect(documentJson.content[0]).toMatchObject({
      content: [
        { type: 'image', attrs: { src: 'missing.png', alt: 'Broken alt', title: 'Broken title' } },
      ],
    })
    expect(onMarkdownChange).toHaveBeenCalledTimes(updateCount)

    const paragraph = editor.querySelector<HTMLElement>(':scope > p:last-child')!
    paragraph.textContent = 'After!'
    fireEvent.input(paragraph, { data: '!', inputType: 'insertText' })
    await waitFor(() =>
      expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toContain(
        '![Broken alt](missing.png "Broken title")',
      ),
    )
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).not.toContain('<br />')
  })

  it('renders an empty image source as inert chrome without changing its node or Markdown', async () => {
    const onMarkdownChange = vi.fn()
    const { container } = render(
      <MilkdownEditor initialMarkdown={'![]()\n\nAfter\n'} onMarkdownChange={onMarkdownChange} />,
    )
    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.ProseMirror')
      expect(element).toBeInTheDocument()
      return element!
    })
    const placeholder = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '.local-image-placeholder[data-image-state="empty"]',
      )
      expect(element).toBeInTheDocument()
      return element!
    })
    const before = proseMirrorDocJSON(editor)
    const updateCount = onMarkdownChange.mock.calls.length

    expect(placeholder).toHaveAttribute('contenteditable', 'false')
    expect(placeholder).toHaveTextContent('Could not load image')
    expect(container.querySelector('.local-image-view img')).not.toBeInTheDocument()
    expect((before as { content: unknown[] }).content[0]).toMatchObject({
      content: [{ type: 'image', attrs: { src: '', alt: '', title: null } }],
    })
    await Promise.resolve()
    expect(proseMirrorDocJSON(editor)).toEqual(before)
    expect(onMarkdownChange).toHaveBeenCalledTimes(updateCount)

    const paragraph = editor.querySelector<HTMLElement>(':scope > p:last-child')!
    paragraph.textContent = 'After!'
    fireEvent.input(paragraph, { data: '!', inputType: 'insertText' })
    await waitFor(() => expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toContain('![]()'))
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).not.toContain('<br />')
  })

  it('updates local image states on one stable root and ignores stale image events', () => {
    const { imageNode, view } = localImageNodeViewTestHarness('a.png', 'Diagram', 'Title')
    const root = view.dom as HTMLElement
    const imageA = root.querySelector('img')!

    expect(view.update?.(imageNode('b.png'), [], {} as never)).toBe(true)
    const imageB = root.querySelector('img')!
    expect(imageB).not.toBe(imageA)
    expect(root.dataset.imageState).toBe('loading')

    fireEvent.error(imageA)
    fireEvent.load(imageA)
    expect(root.querySelector('img')).toBe(imageB)
    expect(root.dataset.imageState).toBe('loading')

    fireEvent.load(imageB)
    expect(root.dataset.imageState).toBe('loaded')
    expect(view.update?.(imageNode('missing.png'), [], {} as never)).toBe(true)
    const missing = root.querySelector('img')!
    fireEvent.error(missing)
    expect(root.dataset.imageState).toBe('error')
    expect(root.querySelector('.local-image-placeholder')).toHaveTextContent('Diagram')

    expect(view.update?.(imageNode('valid.png'), [], {} as never)).toBe(true)
    const valid = root.querySelector('img')!
    fireEvent.load(valid)
    expect(view.dom).toBe(root)
    expect(root.dataset.imageState).toBe('loaded')
    expect(root.querySelector('.local-image-placeholder')).not.toBeInTheDocument()
    view.destroy?.()
  })

  it('ignores only mutations inside the local image NodeView chrome', () => {
    const { view } = localImageNodeViewTestHarness('missing.png', 'Diagram')
    const root = view.dom as HTMLElement
    const image = root.querySelector('img')!
    const outside = document.createElement('p')
    document.body.append(outside)

    expect(
      view.ignoreMutation?.({ type: 'attributes', target: image } as unknown as MutationRecord),
    ).toBe(true)
    expect(
      view.ignoreMutation?.({ type: 'childList', target: root } as unknown as MutationRecord),
    ).toBe(true)
    expect(
      view.ignoreMutation?.({ type: 'attributes', target: outside } as unknown as MutationRecord),
    ).toBe(false)
    view.destroy?.()
  })

  it('does not send a Markdown document path to the local image protocol', async () => {
    const { container } = render(
      <MilkdownEditor initialMarkdown="![Unexpected document](/Users/example/notes.md)" />,
    )

    await waitFor(() =>
      expect(container.querySelector('.invalid-local-image')).toHaveTextContent(
        'Unexpected document',
      ),
    )
    expect(container.querySelector('img:not(.ProseMirror-separator)')).not.toBeInTheDocument()
  })
})

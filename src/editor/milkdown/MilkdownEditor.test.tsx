import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MilkdownEditor } from './MilkdownEditor'

afterEach(cleanup)

function longOutlineMarkdown() {
  return Array.from({ length: 20 }, (_, index) => `## ${index + 1}. Chapter ${index + 1}\n\nContent for chapter ${index + 1}.`).join('\n\n')
}

function setStageGeometry(
  stage: HTMLElement,
  container: HTMLElement,
  scrollTo: ReturnType<typeof vi.fn>,
  initialScrollTop = 0,
  landingOffset = 0,
) {
  let scrollTop = initialScrollTop
  const documentYByHeading = new Map(
    Array.from(container.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')).map((heading, index) => [heading, 120 + index * 100]),
  )

  Object.defineProperties(stage, {
    clientHeight: { configurable: true, get: () => 500 },
    scrollHeight: { configurable: true, get: () => 2200 },
    scrollTop: { configurable: true, get: () => scrollTop, set: (next: number) => { scrollTop = next } },
  })
  Object.defineProperty(stage, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 100, 800, 500) })
  documentYByHeading.forEach((documentY, heading) => {
    Object.defineProperty(heading, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 100 + documentY - scrollTop, 600, 32),
    })
  })
  Object.defineProperty(stage, 'scrollTo', {
    configurable: true,
    value: (options: ScrollToOptions) => {
      scrollTop = Number(options.top ?? 0) + landingOffset
      scrollTo(options)
    },
  })
}

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

  it('switches read mode on the existing ProseMirror instance without remounting it', async () => {
    const { container, rerender } = render(<MilkdownEditor initialMarkdown="A stable document" presentationMode="edit" />)
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

  it('guards task and code-language mutations in read mode while retaining code copy', async () => {
    const { container, getByRole, rerender } = render(
      <MilkdownEditor initialMarkdown={'- [ ] Keep read-only\n\n```javascript\nconst stable = true\n```'} />,
    )
    const task = await waitFor(() => {
      const item = container.querySelector<HTMLElement>('li[data-item-type="task"]')
      expect(item).toBeInTheDocument()
      return item
    })
    const language = getByRole('button', { name: 'Code block language: JavaScript' })

    rerender(<MilkdownEditor initialMarkdown={'- [ ] Keep read-only\n\n```javascript\nconst stable = true\n```'} presentationMode="read" />)

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
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor initialMarkdown={'# First chapter\n\n## A detail\n\nBody'} outlineMount={outlineMount} />,
    )
    const queries = within(outlineMount)

    await waitFor(() => {
      expect(queries.getByRole('navigation', { name: 'Outline' })).toBeInTheDocument()
      expect(queries.getByRole('button', { name: 'First chapter' })).toBeVisible()
      expect(queries.getByRole('button', { name: 'A detail' })).toBeVisible()
    })

    fireEvent.click(queries.getByRole('button', { name: 'A detail' }))
    // Outline navigation deliberately scrolls without moving the editing
    // selection or focusing the editor.  This avoids WebKit scrolling again
    // just to reveal a caret, and therefore keeps navigation read-only too.
    expect(container.querySelector('.ProseMirror')).toBeInTheDocument()
    outlineMount.remove()
  })

  it('navigates through the document-stage DOM scroll root in both edit and read modes', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const onMarkdownChange = vi.fn()
    const { container, rerender } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={'# First\n\n## Second'} onMarkdownChange={onMarkdownChange} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: 'Second' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    let scrollTop = 0
    Object.defineProperty(stage, 'scrollTop', { configurable: true, get: () => scrollTop, set: (next: number) => { scrollTop = next } })
    fireEvent.click(within(outlineMount).getByRole('button', { name: 'Second' }))
    expect(stage.scrollTop).toBe(0)

    onMarkdownChange.mockClear()
    rerender(<section className="document-stage"><MilkdownEditor initialMarkdown={'# First\n\n## Second'} onMarkdownChange={onMarkdownChange} outlineMount={outlineMount} presentationMode="read" /></section>)
    fireEvent.click(within(outlineMount).getByRole('button', { name: 'Second' }))
    expect(stage.scrollTop).toBe(0)
    expect(onMarkdownChange).not.toHaveBeenCalled()
    outlineMount.remove()
  })

  it('uses one outline component for an inline rail and the compact drawer', async () => {
    const onCloseOutline = vi.fn()
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const { rerender } = render(
      <section className="document-stage"><MilkdownEditor initialMarkdown={'# First\n\n## Second'} outlineLayout="drawer" outlineMount={outlineMount} outlineOpen onCloseOutline={onCloseOutline} /></section>,
    )

    await waitFor(() => expect(within(outlineMount).getByRole('navigation', { name: 'Outline' })).toHaveAttribute('id', 'outline-drawer'))
    fireEvent.mouseDown(outlineMount.querySelector('.outline-backdrop')!)
    expect(onCloseOutline).toHaveBeenCalledOnce()

    onCloseOutline.mockClear()
    fireEvent.click(within(outlineMount).getByRole('button', { name: 'Second' }))
    expect(onCloseOutline).toHaveBeenCalledOnce()

    rerender(<section className="document-stage"><MilkdownEditor initialMarkdown={'# First\n\n## Second'} outlineLayout="inline" outlineMount={outlineMount} /></section>)
    await waitFor(() => expect(within(outlineMount).getByRole('navigation', { name: 'Outline' })).not.toHaveAttribute('id'))
    outlineMount.remove()
  })

  it('navigates inline and drawer headings through their stable ProseMirror position', async () => {
    const inlineMount = document.body.appendChild(document.createElement('aside'))
    const drawerMount = document.body.appendChild(document.createElement('aside'))
    const inlineScrollTo = vi.fn()
    const drawerScrollTo = vi.fn()
    const closeDrawer = vi.fn()
    const inline = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={inlineMount} /></section>)

    await waitFor(() => expect(within(inlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const inlineStage = inline.container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(inlineStage, inline.container, inlineScrollTo)
    fireEvent.click(within(inlineMount).getByRole('button', { name: '20. Chapter 20' }))
    expect(inlineStage.scrollTop).toBe(1700)

    const drawer = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineLayout="drawer" outlineMount={drawerMount} outlineOpen onCloseOutline={closeDrawer} /></section>)
    await waitFor(() => expect(within(drawerMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const drawerStage = drawer.container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(drawerStage, drawer.container, drawerScrollTo)
    fireEvent.click(within(drawerMount).getByRole('button', { name: '20. Chapter 20' }))
    expect(drawerStage.scrollTop).toBe(1700)
    expect(closeDrawer).toHaveBeenCalledOnce()

    inlineMount.remove()
    drawerMount.remove()
  })

  it('uses the last visible heading as active at the document bottom', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo, 1700)
    fireEvent.scroll(stage)

    await waitFor(() => {
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location')
      expect(within(outlineMount).getByRole('button', { name: '18. Chapter 18' })).not.toHaveAttribute('aria-current')
    })
    outlineMount.remove()
  })

  it('keeps a clicked heading active until its resulting scroll position is observed', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    let scrollTop = 0
    Object.defineProperties(stage, {
      clientHeight: { configurable: true, get: () => 500 },
      scrollHeight: { configurable: true, get: () => 2200 },
      scrollTop: { configurable: true, get: () => scrollTop, set: (next: number) => { scrollTop = next } },
    })
    Object.defineProperty(stage, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 100, 800, 500) })
    Array.from(container.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')).forEach((heading, index) => {
      Object.defineProperty(heading, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 220 + index * 100, 600, 32) })
    })
    Object.defineProperty(stage, 'scrollTo', { configurable: true, value: vi.fn() })

    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '18. Chapter 18' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('keeps the clicked heading active when WebKit lands just below the activation line', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '10. Chapter 10' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    // A fractional landing position replicates the WebKit boundary case: the
    // heading is 0.5px under its intended anchor, while the preceding heading
    // is already above it.
    setStageGeometry(stage, container, scrollTo, 0, -0.5)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '10. Chapter 10' }))
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '10. Chapter 10' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '9. Chapter 9' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('keeps a clicked final heading active through programmatic bottom-scroll frames', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo, 0)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    fireEvent.scroll(stage)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '18. Chapter 18' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('clears a hidden tab\'s navigation lock before it becomes active again', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const initialMarkdown = longOutlineMarkdown()
    const { container, rerender } = render(
      <section className="document-stage"><MilkdownEditor active initialMarkdown={initialMarkdown} outlineMount={outlineMount} /></section>,
    )

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '13. Chapter 13' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, vi.fn())
    fireEvent.click(within(outlineMount).getByRole('button', { name: '13. Chapter 13' }))
    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '13. Chapter 13' })).toHaveAttribute('aria-current', 'location'))

    rerender(
      <section className="document-stage"><MilkdownEditor active={false} initialMarkdown={initialMarkdown} outlineMount={outlineMount} /></section>,
    )
    stage.scrollTop = 1700
    rerender(
      <section className="document-stage"><MilkdownEditor active initialMarkdown={initialMarkdown} outlineMount={outlineMount} /></section>,
    )
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '13. Chapter 13' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('keeps a clicked penultimate heading active when bottom clamping also exposes the final heading', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '19. Chapter 19' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '19. Chapter 19' }))
    fireEvent.scroll(stage)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '19. Chapter 19' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).not.toHaveAttribute('aria-current')

    // A real pointer interaction is the hand-off to ordinary scroll-derived
    // highlighting; at the bottom that correctly resolves to chapter 20.
    fireEvent.pointerDown(stage)
    fireEvent.scroll(stage)
    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute('aria-current', 'location'))
    outlineMount.remove()
  })

  it('returns to scroll-derived active state after the clicked navigation has painted', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    // Mimic a scrollbar drag after the click. It does not emit a wheel event,
    // so the active item must not be held by a stale pending navigation.
    fireEvent.pointerDown(stage)
    stage.scrollTop = 0
    fireEvent.scroll(stage)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '1. Chapter 1' })).toHaveAttribute('aria-current', 'location'))
    expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('does not let an inactive editor navigate its hidden tab outline', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(<section className="document-stage"><MilkdownEditor active={false} initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} /></section>)

    await waitFor(() => expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo)
    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    expect(scrollTo).not.toHaveBeenCalled()
    outlineMount.remove()
  })

  it('resolves navigation from the editor that becomes active after a tab switch', async () => {
    const firstOutlineMount = document.body.appendChild(document.createElement('aside'))
    const secondOutlineMount = document.body.appendChild(document.createElement('aside'))
    const first = render(
      <section className="document-stage">
        <MilkdownEditor active initialMarkdown={longOutlineMarkdown()} outlineMount={firstOutlineMount} />
      </section>,
    )
    const second = render(
      <section className="document-stage">
        <MilkdownEditor active={false} initialMarkdown={longOutlineMarkdown().replaceAll('Chapter', 'Other chapter')} outlineMount={secondOutlineMount} />
      </section>,
    )

    await waitFor(() => expect(within(firstOutlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible())
    await waitFor(() => expect(within(secondOutlineMount).getByRole('button', { name: '20. Other chapter 20' })).toBeVisible())
    const firstStage = first.container.querySelector<HTMLElement>('.document-stage')!
    const secondStage = second.container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(firstStage, first.container, vi.fn())
    setStageGeometry(secondStage, second.container, vi.fn())

    // The inactive document's stale heading model cannot move either stage.
    fireEvent.click(within(secondOutlineMount).getByRole('button', { name: '20. Other chapter 20' }))
    expect(secondStage.scrollTop).toBe(0)

    second.rerender(
      <section className="document-stage">
        <MilkdownEditor active initialMarkdown={longOutlineMarkdown().replaceAll('Chapter', 'Other chapter')} outlineMount={secondOutlineMount} />
      </section>,
    )
    fireEvent.click(within(secondOutlineMount).getByRole('button', { name: '20. Other chapter 20' }))

    expect(secondStage.scrollTop).toBe(1700)
    expect(firstStage.scrollTop).toBe(0)
    firstOutlineMount.remove()
    secondOutlineMount.remove()
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

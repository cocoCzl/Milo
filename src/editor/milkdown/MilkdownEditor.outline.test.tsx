import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MilkdownEditor } from './MilkdownEditor'

import { longOutlineMarkdown, setStageGeometry } from './editorTestFixtures'

afterEach(cleanup)

describe('MilkdownEditor outline', () => {
  it('builds a clickable document outline from headings', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <MilkdownEditor
        initialMarkdown={'# First chapter\n\n## A detail\n\nBody'}
        outlineMount={outlineMount}
      />,
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
    const { container, rerender } = render(
      <section className="document-stage">
        <MilkdownEditor
          initialMarkdown={'# First\n\n## Second'}
          onMarkdownChange={onMarkdownChange}
          outlineMount={outlineMount}
        />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: 'Second' })).toBeVisible(),
    )
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    let scrollTop = 0
    Object.defineProperty(stage, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (next: number) => {
        scrollTop = next
      },
    })
    fireEvent.click(within(outlineMount).getByRole('button', { name: 'Second' }))
    expect(stage.scrollTop).toBe(0)

    onMarkdownChange.mockClear()
    rerender(
      <section className="document-stage">
        <MilkdownEditor
          initialMarkdown={'# First\n\n## Second'}
          onMarkdownChange={onMarkdownChange}
          outlineMount={outlineMount}
          presentationMode="read"
        />
      </section>,
    )
    fireEvent.click(within(outlineMount).getByRole('button', { name: 'Second' }))
    expect(stage.scrollTop).toBe(0)
    expect(onMarkdownChange).not.toHaveBeenCalled()
    outlineMount.remove()
  })

  it('uses one outline component for an inline rail and the compact drawer', async () => {
    const onCloseOutline = vi.fn()
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const { rerender } = render(
      <section className="document-stage">
        <MilkdownEditor
          initialMarkdown={'# First\n\n## Second'}
          outlineLayout="drawer"
          outlineMount={outlineMount}
          outlineOpen
          onCloseOutline={onCloseOutline}
        />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('navigation', { name: 'Outline' })).toHaveAttribute(
        'id',
        'outline-drawer',
      ),
    )
    fireEvent.mouseDown(outlineMount.querySelector('.outline-backdrop')!)
    expect(onCloseOutline).toHaveBeenCalledOnce()

    onCloseOutline.mockClear()
    fireEvent.click(within(outlineMount).getByRole('button', { name: 'Second' }))
    expect(onCloseOutline).toHaveBeenCalledOnce()

    rerender(
      <section className="document-stage">
        <MilkdownEditor
          initialMarkdown={'# First\n\n## Second'}
          outlineLayout="inline"
          outlineMount={outlineMount}
        />
      </section>,
    )
    await waitFor(() =>
      expect(within(outlineMount).getByRole('navigation', { name: 'Outline' })).not.toHaveAttribute(
        'id',
      ),
    )
    outlineMount.remove()
  })

  it('navigates inline and drawer headings through their stable ProseMirror position', async () => {
    const inlineMount = document.body.appendChild(document.createElement('aside'))
    const drawerMount = document.body.appendChild(document.createElement('aside'))
    const inlineScrollTo = vi.fn()
    const drawerScrollTo = vi.fn()
    const closeDrawer = vi.fn()
    const inline = render(
      <section className="document-stage">
        <MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={inlineMount} />
      </section>,
    )

    await waitFor(() =>
      expect(within(inlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible(),
    )
    const inlineStage = inline.container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(inlineStage, inline.container, inlineScrollTo)
    fireEvent.click(within(inlineMount).getByRole('button', { name: '20. Chapter 20' }))
    expect(inlineStage.scrollTop).toBe(1700)

    const drawer = render(
      <section className="document-stage">
        <MilkdownEditor
          initialMarkdown={longOutlineMarkdown()}
          outlineLayout="drawer"
          outlineMount={drawerMount}
          outlineOpen
          onCloseOutline={closeDrawer}
        />
      </section>,
    )
    await waitFor(() =>
      expect(within(drawerMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible(),
    )
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
    const { container } = render(
      <section className="document-stage">
        <MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible(),
    )
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo, 1700)
    fireEvent.scroll(stage)

    await waitFor(() => {
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute(
        'aria-current',
        'location',
      )
      expect(
        within(outlineMount).getByRole('button', { name: '18. Chapter 18' }),
      ).not.toHaveAttribute('aria-current')
    })
    outlineMount.remove()
  })

  it('keeps a clicked heading active until its resulting scroll position is observed', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const { container } = render(
      <section className="document-stage">
        <MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible(),
    )
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    let scrollTop = 0
    Object.defineProperties(stage, {
      clientHeight: { configurable: true, get: () => 500 },
      scrollHeight: { configurable: true, get: () => 2200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (next: number) => {
          scrollTop = next
        },
      },
    })
    Object.defineProperty(stage, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 100, 800, 500),
    })
    Array.from(
      container.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3'),
    ).forEach((heading, index) => {
      Object.defineProperty(heading, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(0, 220 + index * 100, 600, 32),
      })
    })
    Object.defineProperty(stage, 'scrollTo', { configurable: true, value: vi.fn() })

    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    fireEvent.scroll(stage)

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )
    expect(
      within(outlineMount).getByRole('button', { name: '18. Chapter 18' }),
    ).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('keeps the clicked heading active when WebKit lands just below the activation line', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(
      <section className="document-stage">
        <MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '10. Chapter 10' })).toBeVisible(),
    )
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    // A fractional landing position replicates the WebKit boundary case: the
    // heading is 0.5px under its intended anchor, while the preceding heading
    // is already above it.
    setStageGeometry(stage, container, scrollTo, 0, -0.5)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '10. Chapter 10' }))
    fireEvent.scroll(stage)

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '10. Chapter 10' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )
    expect(within(outlineMount).getByRole('button', { name: '9. Chapter 9' })).not.toHaveAttribute(
      'aria-current',
    )
    outlineMount.remove()
  })

  it('keeps a clicked final heading active through programmatic bottom-scroll frames', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(
      <section className="document-stage">
        <MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible(),
    )
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo, 0)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    fireEvent.scroll(stage)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    fireEvent.scroll(stage)

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )
    expect(
      within(outlineMount).getByRole('button', { name: '18. Chapter 18' }),
    ).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it("clears a hidden tab's navigation lock before it becomes active again", async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const initialMarkdown = longOutlineMarkdown()
    const { container, rerender } = render(
      <section className="document-stage">
        <MilkdownEditor active initialMarkdown={initialMarkdown} outlineMount={outlineMount} />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '13. Chapter 13' })).toBeVisible(),
    )
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, vi.fn())
    fireEvent.click(within(outlineMount).getByRole('button', { name: '13. Chapter 13' }))
    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '13. Chapter 13' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )

    rerender(
      <section className="document-stage">
        <MilkdownEditor
          active={false}
          initialMarkdown={initialMarkdown}
          outlineMount={outlineMount}
        />
      </section>,
    )
    stage.scrollTop = 1700
    rerender(
      <section className="document-stage">
        <MilkdownEditor active initialMarkdown={initialMarkdown} outlineMount={outlineMount} />
      </section>,
    )
    fireEvent.scroll(stage)

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )
    expect(
      within(outlineMount).getByRole('button', { name: '13. Chapter 13' }),
    ).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('keeps a clicked penultimate heading active when bottom clamping also exposes the final heading', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(
      <section className="document-stage">
        <MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '19. Chapter 19' })).toBeVisible(),
    )
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '19. Chapter 19' }))
    fireEvent.scroll(stage)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    fireEvent.scroll(stage)

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '19. Chapter 19' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )
    expect(
      within(outlineMount).getByRole('button', { name: '20. Chapter 20' }),
    ).not.toHaveAttribute('aria-current')

    // A real pointer interaction is the hand-off to ordinary scroll-derived
    // highlighting; at the bottom that correctly resolves to chapter 20.
    fireEvent.pointerDown(stage)
    fireEvent.scroll(stage)
    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )
    outlineMount.remove()
  })

  it('returns to scroll-derived active state after the clicked navigation has painted', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(
      <section className="document-stage">
        <MilkdownEditor initialMarkdown={longOutlineMarkdown()} outlineMount={outlineMount} />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible(),
    )
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(stage, container, scrollTo)

    fireEvent.click(within(outlineMount).getByRole('button', { name: '20. Chapter 20' }))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    // Mimic a scrollbar drag after the click. It does not emit a wheel event,
    // so the active item must not be held by a stale pending navigation.
    fireEvent.pointerDown(stage)
    stage.scrollTop = 0
    fireEvent.scroll(stage)

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '1. Chapter 1' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )
    expect(
      within(outlineMount).getByRole('button', { name: '20. Chapter 20' }),
    ).not.toHaveAttribute('aria-current')
    outlineMount.remove()
  })

  it('does not let an inactive editor navigate its hidden tab outline', async () => {
    const outlineMount = document.body.appendChild(document.createElement('aside'))
    const scrollTo = vi.fn()
    const { container } = render(
      <section className="document-stage">
        <MilkdownEditor
          active={false}
          initialMarkdown={longOutlineMarkdown()}
          outlineMount={outlineMount}
        />
      </section>,
    )

    await waitFor(() =>
      expect(within(outlineMount).getByRole('button', { name: '20. Chapter 20' })).toBeVisible(),
    )
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
        <MilkdownEditor
          active
          initialMarkdown={longOutlineMarkdown()}
          outlineMount={firstOutlineMount}
        />
      </section>,
    )
    const second = render(
      <section className="document-stage">
        <MilkdownEditor
          active={false}
          initialMarkdown={longOutlineMarkdown().replaceAll('Chapter', 'Other chapter')}
          outlineMount={secondOutlineMount}
        />
      </section>,
    )

    await waitFor(() =>
      expect(
        within(firstOutlineMount).getByRole('button', { name: '20. Chapter 20' }),
      ).toBeVisible(),
    )
    await waitFor(() =>
      expect(
        within(secondOutlineMount).getByRole('button', { name: '20. Other chapter 20' }),
      ).toBeVisible(),
    )
    const firstStage = first.container.querySelector<HTMLElement>('.document-stage')!
    const secondStage = second.container.querySelector<HTMLElement>('.document-stage')!
    setStageGeometry(firstStage, first.container, vi.fn())
    setStageGeometry(secondStage, second.container, vi.fn())

    // The inactive document's stale heading model cannot move either stage.
    fireEvent.click(
      within(secondOutlineMount).getByRole('button', { name: '20. Other chapter 20' }),
    )
    expect(secondStage.scrollTop).toBe(0)

    second.rerender(
      <section className="document-stage">
        <MilkdownEditor
          active
          initialMarkdown={longOutlineMarkdown().replaceAll('Chapter', 'Other chapter')}
          outlineMount={secondOutlineMount}
        />
      </section>,
    )
    fireEvent.click(
      within(secondOutlineMount).getByRole('button', { name: '20. Other chapter 20' }),
    )

    expect(secondStage.scrollTop).toBe(1700)
    expect(firstStage.scrollTop).toBe(0)
    firstOutlineMount.remove()
    secondOutlineMount.remove()
  })
})

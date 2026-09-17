import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const external = vi.hoisted(() => ({ open: vi.fn((): Promise<void> => Promise.resolve()) }))

vi.mock('../../file-system/externalLink', () => ({
  isExternalHttpUrl: (url: string) => /^https?:\/\//i.test(url),
  openExternalLink: external.open,
}))

import { MilkdownEditor } from './MilkdownEditor'

afterEach(() => {
  cleanup()
  external.open.mockClear()
})

describe('MilkdownEditor external links', () => {
  async function renderLink(presentationMode: 'edit' | 'read' = 'edit') {
    const view = render(<MilkdownEditor initialMarkdown="[百度](https://www.baidu.com/)" presentationMode={presentationMode} />)
    const link = await waitFor(() => {
      const element = view.container.querySelector<HTMLAnchorElement>('.ProseMirror a')
      expect(element).toBeInTheDocument()
      return element!
    })
    return { link, ...view }
  }

  it('keeps an edit-mode normal click in the editor', async () => {
    const { link } = await renderLink()
    // JSDOM has no navigation implementation. Real Milo keeps this click in
    // the editor; prevent only JSDOM's native anchor fallback in this test.
    link.addEventListener('click', (event) => event.preventDefault(), { once: true })
    fireEvent.click(link)
    expect(external.open).not.toHaveBeenCalled()
  })

  it('opens an edit-mode Command/Ctrl click through the safe external opener', async () => {
    const { link } = await renderLink()
    fireEvent.click(link, { metaKey: true })
    expect(external.open).toHaveBeenCalledWith('https://www.baidu.com/')

    external.open.mockClear()
    fireEvent.click(link, { ctrlKey: true })
    expect(external.open).toHaveBeenCalledWith('https://www.baidu.com/')
  })

  it('opens a read-mode normal click through the safe external opener', async () => {
    const { link } = await renderLink('read')
    fireEvent.click(link)
    expect(external.open).toHaveBeenCalledWith('https://www.baidu.com/')
  })
})

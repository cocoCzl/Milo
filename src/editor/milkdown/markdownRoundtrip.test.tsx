import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { inspectMarkdownDocument, composeMarkdownDocument } from '../markdown/documentSafety'
import { normalizeMarkdown } from '../markdown/codec'
import { MilkdownEditor } from './MilkdownEditor'

afterEach(cleanup)
it('retains supported semantics after a small edit, while recording normalization differences', async () => {
  const source = readFileSync('src/editor/markdown/__fixtures__/roundtrip.md', 'utf8')
  const inspected = inspectMarkdownDocument(source)
  expect(inspected.protectionReason).toBeNull()
  const change = vi.fn()
  const { container } = render(
    <MilkdownEditor initialMarkdown={inspected.body} onMarkdownChange={change} />,
  )
  await waitFor(() =>
    expect(container.querySelector('.milkdown-editor')).toHaveAttribute('aria-busy', 'false'),
  )
  const paragraph = [...container.querySelectorAll('.ProseMirror > p')].find(
    (p) => p.textContent === 'Opening words.',
  )!
  paragraph.textContent = 'Opening words edited.'
  fireEvent.input(paragraph.closest('.ProseMirror')!, { inputType: 'insertText' })
  await waitFor(() => expect(change).toHaveBeenCalled())
  const body = change.mock.calls.at(-1)![0] as string
  expect(normalizeMarkdown(body)).toBe(
    normalizeMarkdown(inspected.body.replace('Opening words.', 'Opening words edited.')),
  )
  expect(
    composeMarkdownDocument(inspected.frontMatter, body).startsWith(inspected.frontMatter),
  ).toBe(true)
  // Explicitly document normalized formatting, not lossless whole-file editing.
  expect(body).toContain('* First')
  expect(body).toContain('```typescript')
  expect(body).toContain('Hard break\\\nnext line.')
  expect(body).toMatchSnapshot()
})

it('does not publish normalized content merely for saving, mode or outline changes', async () => {
  const change = vi.fn()
  let flush: (() => boolean) | null = null
  const source = '# Heading\n\n- Original marker\n'
  const { container, rerender } = render(
    <MilkdownEditor
      initialMarkdown={source}
      onMarkdownChange={change}
      onRegisterFlush={(fn) => {
        flush = fn
      }}
    />,
  )
  await waitFor(() => expect(flush).toBeTypeOf('function'))
  expect(flush!()).toBe(true)
  rerender(
    <MilkdownEditor initialMarkdown={source} presentationMode="read" onMarkdownChange={change} />,
  )
  expect(container.querySelector('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
  expect(change).not.toHaveBeenCalled()
})

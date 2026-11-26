import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it.each([
  ['0', '/private/tmp/milo-ime-diagnostic/doc.md', false],
  ['1', '/Users/example/private.md', false],
  ['1', '/private/tmp/milo-ime-diagnostic/doc.md', true],
])('gates publish text reads for tracing=%s, path=%s', async (enabled, path, allowed) => {
  vi.resetModules()
  vi.stubEnv('VITE_MILO_INPUT_TRACE', enabled)
  vi.stubEnv('VITE_MILO_INPUT_TRACE_PATH', '/private/tmp/milo-ime-diagnostic/doc.md')
  const { MilkdownEditor } = await import('./MilkdownEditor')
  const { Node } = await import('@milkdown/prose/model')
  const registered: { publish: (() => boolean) | null } = { publish: null }
  const changed = vi.fn()
  const { container, unmount } = render(
    <MilkdownEditor
      initialMarkdown="Before"
      documentPath={path}
      onContentChange={changed}
      onRegisterFlush={(flush) => {
        registered.publish = flush
      }}
    />,
  )
  await waitFor(() =>
    expect(container.querySelector('.milkdown-editor')).toHaveAttribute('aria-busy', 'false'),
  )
  const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!
  const docReads = vi.fn()
  vi.spyOn(Node.prototype, 'textContent', 'get').mockImplementation(function (
    this: InstanceType<typeof Node>,
  ) {
    if (this.type.name === 'doc') docReads()
    return descriptor.get!.call(this) as string
  })
  // No Markdown callback: serialization is outside this diagnostic assertion.
  // Exercise an automated DOM input, then the existing publication boundary.
  const paragraph = container.querySelector('.ProseMirror p')!
  paragraph.textContent = 'After PRIVATE_MARKER'
  fireEvent.input(paragraph, { data: 'After PRIVATE_MARKER', inputType: 'insertText' })
  await waitFor(() => expect(changed).toHaveBeenCalled())
  docReads.mockClear()
  expect(registered.publish?.()).toBe(true)
  expect(docReads).toHaveBeenCalledTimes(allowed ? 1 : 0)
  // Keep the content/selection intact; tracing must never transform authored text.
  expect(paragraph).toHaveTextContent('After PRIVATE_MARKER')
  unmount()
})

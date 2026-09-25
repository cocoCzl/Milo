import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorView } from '@milkdown/prose/view'
import { BlockHandle } from './BlockHandle'
import type { BlockTarget } from './blockControls'
import type { ContextualEditorStore } from './contextualEditorStore'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function renderAtRects(block: { top: number; bottom: number }, stageRect: { top: number; bottom: number }) {
  const stage = document.body.appendChild(document.createElement('section'))
  stage.className = 'document-stage'
  const editor = stage.appendChild(document.createElement('div'))
  editor.className = 'ProseMirror'
  Object.defineProperty(stage, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, stageRect.top, 800, stageRect.bottom - stageRect.top),
  })
  const doc = {} as BlockTarget['doc']
  const target = {
    editorId: 'editor',
    doc,
    targetBlockPosition: 12,
    selection: { doc, from: 13, to: 13, text: '' },
    blockType: 'paragraph',
    containerBlockPosition: 12,
    insertAfterPosition: 15,
    rect: { left: 200, right: 700, ...block },
  } as BlockTarget
  const snapshot = { view: { dom: editor } as unknown as EditorView, state: null, from: 0, to: 0 }
  const store = {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
  } as unknown as ContextualEditorStore
  return render(
    <BlockHandle
      active
      editorId="editor"
      interactionOpen={false}
      label="Add block"
      menuTarget={target}
      onOpenMenu={() => undefined}
      store={store}
    />,
  )
}

describe('Block Handle visible-intersection positioning', () => {
  it.each([
    ['ordinary paragraph', { top: 150, bottom: 182 }, { top: 100, bottom: 500 }, 153],
    ['ordinary heading', { top: 220, bottom: 260 }, { top: 100, bottom: 500 }, 227],
    ['tall block with its top visible', { top: 211, bottom: 1685 }, { top: 48, bottom: 228 }, 194],
    ['tall block with its middle visible', { top: -489, bottom: 985 }, { top: 48, bottom: 228 }, 125],
    ['tall block with its bottom visible', { top: -972, bottom: 502 }, { top: 48, bottom: 228 }, 125],
  ])('positions a %s from its intersection with the document stage', (_name, block, stage, expected) => {
    const ui = renderAtRects(block, stage)
    expect(ui.getByRole('button', { name: 'Add block' })).toHaveStyle({ top: `${expected}px` })
  })

  it('does not position blocks fully above or below the document stage', () => {
    const stage = { top: 100, bottom: 500 }
    expect(renderAtRects({ top: -300, bottom: 50 }, stage).queryByRole('button', { name: 'Add block' })).toBeNull()
    cleanup()
    expect(renderAtRects({ top: 550, bottom: 900 }, stage).queryByRole('button', { name: 'Add block' })).toBeNull()
  })

  it('hides outside the stage, reappears with the same frozen target, and never clears its semantics', async () => {
    const stage = document.body.appendChild(document.createElement('section'))
    stage.className = 'document-stage'
    const editor = stage.appendChild(document.createElement('div'))
    editor.className = 'ProseMirror'
    Object.defineProperty(stage, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 100, 800, 400),
    })

    let blockTop = -300
    const doc = {} as BlockTarget['doc']
    const rect = {
      left: 200,
      get top() { return blockTop },
      right: 700,
      get bottom() { return blockTop + 250 },
    }
    const frozenTarget = {
      editorId: 'editor',
      doc,
      targetBlockPosition: 12,
      selection: { doc, from: 13, to: 13, text: '' },
      blockType: 'table',
      containerBlockPosition: 10,
      insertAfterPosition: 42,
      rect,
    } as BlockTarget
    const snapshot = { view: { dom: editor } as unknown as EditorView, state: null, from: 0, to: 0 }
    const store = {
      subscribe: () => () => undefined,
      getSnapshot: () => snapshot,
    } as unknown as ContextualEditorStore
    const onOpenMenu = vi.fn()
    const ui = render(
      <BlockHandle
        active
        editorId="editor"
        interactionOpen={false}
        label="Add block"
        menuTarget={frozenTarget}
        onOpenMenu={onOpenMenu}
        store={store}
      />,
    )

    expect(ui.queryByRole('button', { name: 'Add block' })).toBeNull()
    expect(frozenTarget).toMatchObject({
      targetBlockPosition: 12,
      selection: { doc, from: 13, to: 13, text: '' },
      containerBlockPosition: 10,
      insertAfterPosition: 42,
    })

    blockTop = 450
    fireEvent(window, new Event('resize'))
    const handle = await ui.findByRole('button', { name: 'Add block' })
    expect(handle).toHaveStyle({ top: '462px' })
    fireEvent.click(handle)
    expect(onOpenMenu).toHaveBeenCalledWith(frozenTarget)

    blockTop = 550
    fireEvent.scroll(stage)
    await waitFor(() => expect(ui.queryByRole('button', { name: 'Add block' })).toBeNull())
    expect(onOpenMenu).toHaveBeenCalledWith(frozenTarget)
  })
})

import { afterEach, expect, it, vi } from 'vitest'
import { EditorState, Plugin } from '@milkdown/prose/state'
import { EditorView, type NodeViewConstructor } from '@milkdown/prose/view'
import { Schema } from '@milkdown/prose/model'
import {
  editorResourceCounts,
  editorResourcePlugins,
  profileNodeView,
  trackEditorResource,
} from './editorResources'

afterEach(() => vi.unstubAllEnvs())

it('adds no plugins, wrappers or counters in ordinary builds', () => {
  vi.stubEnv('VITE_MILO_PROFILE', '')
  const before = editorResourceCounts()
  const create: NodeViewConstructor = () => ({ dom: document.createElement('span') })
  expect(profileNodeView('imageViews', create)).toBe(create)
  expect(editorResourcePlugins()).toEqual([])
  trackEditorResource('editorViews')()
  expect(editorResourceCounts()).toEqual(before)
})

it('counts actual ProseMirror view and NodeView destruction, independently of probe removal', () => {
  vi.stubEnv('VITE_MILO_PROFILE', '1')
  const before = editorResourceCounts()
  const schema = new Schema({
    nodes: { doc: { content: 'image*' }, image: { atom: true }, text: {} },
  })
  const destroy = vi.fn()
  const create = profileNodeView('imageViews', () => ({
    dom: document.createElement('img'),
    destroy,
  }))
  const host = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(host, {
    state: EditorState.create({
      doc: schema.node('doc', null, [schema.node('image')]),
      plugins: editorResourcePlugins(),
    }),
    nodeViews: { image: create },
  })
  try {
    view.updateState(
      view.state.reconfigure({ plugins: [...editorResourcePlugins(), new Plugin({})] }),
    )
    expect(view.isDestroyed).toBe(false)
    expect(editorResourceCounts().editorViews?.created).toBe((before.editorViews?.created ?? 0) + 1)
    expect(editorResourceCounts().editorViews?.destroyed).toBe(before.editorViews?.destroyed ?? 0)
    expect(editorResourceCounts().editorViews?.live).toBe((before.editorViews?.live ?? 0) + 1)
    expect(editorResourceCounts().imageViews?.live).toBe((before.imageViews?.live ?? 0) + 1)
  } finally {
    view.destroy()
    host.remove()
  }
  expect(destroy).toHaveBeenCalledOnce()
  for (const kind of ['editorViews', 'imageViews'] as const) {
    const after = editorResourceCounts()[kind]!
    expect(after.live).toBe(before[kind]?.live ?? 0)
    expect(after.created).toBe((before[kind]?.created ?? 0) + 1)
    expect(after.destroyed).toBe((before[kind]?.destroyed ?? 0) + 1)
  }
  const stop = trackEditorResource('codeViews')
  stop()
  const stopped = editorResourceCounts()
  stop()
  expect(editorResourceCounts()).toEqual(stopped)
})

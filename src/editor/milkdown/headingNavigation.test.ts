import { describe, expect, it, vi } from 'vitest'
import { Schema } from '@milkdown/prose/model'
import { EditorState } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { activeHeadingFromScroll, headingElementResolver } from './headingNavigation'

it('uses logarithmic live geometry reads and accounts for changed layout', () => {
  const headings = Array.from({ length: 4096 }, (_, i) => ({
    id: String(i),
    key: String(i),
    level: 2,
    text: String(i),
    pos: i,
  }))
  const stage = document.createElement('section')
  Object.defineProperties(stage, { scrollHeight: { value: 500_000 }, clientHeight: { value: 800 } })
  stage.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect
  let offset = 100_000
  const measure = vi.fn(
    (pos: number) =>
      ({
        getBoundingClientRect: () => ({ top: pos * 100 - offset, bottom: pos * 100 - offset + 20 }),
      }) as HTMLElement,
  )
  expect(activeHeadingFromScroll(headings, measure, stage)).toBe(1000)
  expect(measure.mock.calls.length).toBeLessThanOrEqual(13)
  offset = 200_000 // Simulate changed zoom/layout with no stale position cache.
  expect(activeHeadingFromScroll(headings, measure, stage)).toBe(2000)
})

describe('scroll navigation', () => {
  it('retains bottom tolerance and handles no headings', () => {
    const stage = document.createElement('section')
    stage.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect
    const headings = [{ id: 'last', key: 'last', level: 2, text: '最后', pos: 10 }]
    expect(activeHeadingFromScroll([], () => null, stage)).toBeNull()
    expect(
      activeHeadingFromScroll(
        headings,
        () => ({ getBoundingClientRect: () => ({ top: 700, bottom: 740 }) }) as HTMLElement,
        stage,
      ),
    ).toBe(10)
  })
})

it('validates references once per pass and rebuilds after DOM replacement or document updates', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'heading+' },
      heading: { content: 'text*', attrs: { id: { default: '' }, level: { default: 2 } } },
      text: {},
    },
  })
  const state = (text: string) =>
    EditorState.create({
      schema,
      doc: schema.nodes.doc.create(
        null,
        schema.nodes.heading.create({ id: 'same', level: 2 }, schema.text(text)),
      ),
    })
  const dom = document.createElement('div')
  dom.innerHTML = '<h2 id="same">重复中文标题</h2>'
  const view = { dom, state: state('重复中文标题') }
  const asView = () => view as unknown as EditorView
  const heading = { id: 'same', key: 'same', pos: 0, level: 2, text: '重复中文标题' }
  const first = headingElementResolver(asView())(heading)
  const contains = vi.spyOn(dom, 'contains')
  const resolve = headingElementResolver(asView())
  for (let i = 0; i < 20; i++) expect(resolve(heading)).toBe(first)
  expect(contains).toHaveBeenCalledTimes(1)
  dom.innerHTML = '<h2 id="same">重复中文标题</h2>'
  const rebuilt = headingElementResolver(asView())(heading)
  expect(rebuilt).toBe(dom.firstElementChild)
  expect(rebuilt).not.toBe(first)
  view.state = state('编辑后的标题')
  dom.firstElementChild!.textContent = '编辑后的标题'
  const updated = headingElementResolver(asView())
  expect(updated(heading)).toBeNull()
  expect(updated({ ...heading, text: '编辑后的标题' })).toBe(dom.firstElementChild)
})

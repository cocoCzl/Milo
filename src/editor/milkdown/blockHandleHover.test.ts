import { describe, expect, it } from 'vitest'
import type { BlockTarget } from './blockControls'
import { isWithinBlockHoverCorridor, resolveBlockHandleHover } from './blockHandleHover'

function target(position: number, top = 100): BlockTarget {
  const doc = {} as BlockTarget['doc']
  return {
    editorId: 'editor',
    doc,
    targetBlockPosition: position,
    selection: { doc, from: position + 1, to: position + 1, text: '' },
    blockType: 'paragraph',
    rect: { left: 200, top, right: 700, bottom: top + 32 },
  }
}

describe('Block Handle hover ownership', () => {
  it('activates only from a block gutter, then keeps ownership across the complete block corridor', () => {
    const current = target(1)
    expect(resolveBlockHandleHover({ current: null, candidate: current, pointer: { left: 190, top: 112 }, pointerInBlockUi: false })).toBe(current)
    expect(isWithinBlockHoverCorridor(current, { left: 650, top: 112 })).toBe(true)
    expect(resolveBlockHandleHover({ current, candidate: current, pointer: { left: 650, top: 112 }, pointerInBlockUi: false })).toBe(current)
  })

  it('keeps the frozen target through repeated Handle and menu pointer moves without re-resolving a block', () => {
    const current = target(1)
    let result: BlockTarget | null = current
    for (let move = 0; move < 20; move += 1) {
      result = resolveBlockHandleHover({
        current: result,
        candidate: null,
        pointer: { left: 166, top: 112 },
        pointerInBlockUi: true,
      })
      expect(result).toBe(current)
    }
  })

  it('changes blocks only after the pointer has left the owned corridor and entered another gutter', () => {
    const first = target(1, 100)
    const second = target(8, 180)
    expect(resolveBlockHandleHover({ current: first, candidate: null, pointer: { left: 190, top: 160 }, pointerInBlockUi: false })).toBeNull()
    expect(resolveBlockHandleHover({ current: first, candidate: second, pointer: { left: 190, top: 192 }, pointerInBlockUi: false })).toBe(second)
  })

  it('clears only after leaving the editor block, gutter, Handle, and menu ownership areas', () => {
    const current = target(1)
    expect(resolveBlockHandleHover({ current, candidate: null, pointer: { left: 100, top: 50 }, pointerInBlockUi: false })).toBeNull()
  })
})

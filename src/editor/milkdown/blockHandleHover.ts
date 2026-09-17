import type { BlockTarget } from './blockControls'

export const blockHandleGutterWidth = 42
const activationInset = 18

type PointerCoordinates = { left: number; top: number }

function sameBlock(left: BlockTarget | null, right: BlockTarget | null) {
  return left?.doc === right?.doc && left?.targetBlockPosition === right?.targetBlockPosition
}

// Once a block owns the lightweight affordance, its full visible block and
// its left gutter form one continuous hover corridor. The handle and menu
// themselves are accounted for by the caller because they are portaled out of
// the editor DOM tree.
export function isWithinBlockHoverCorridor(target: BlockTarget, pointer: PointerCoordinates) {
  return pointer.left >= target.rect.left - blockHandleGutterWidth
    && pointer.left <= target.rect.right
    && pointer.top >= target.rect.top
    && pointer.top <= target.rect.bottom
}

function isWithinActivationGutter(target: BlockTarget, pointer: PointerCoordinates) {
  return pointer.left >= target.rect.left - blockHandleGutterWidth
    && pointer.left <= target.rect.left + activationInset
    && pointer.top >= target.rect.top
    && pointer.top <= target.rect.bottom
}

export function resolveBlockHandleHover({
  candidate,
  current,
  pointer,
  pointerInBlockUi,
}: {
  candidate: BlockTarget | null
  current: BlockTarget | null
  pointer: PointerCoordinates
  pointerInBlockUi: boolean
}): BlockTarget | null {
  // Never ask posAtCoords to reinterpret a pointer owned by the portaled
  // handle or menu. The locked target is deliberately kept by identity.
  if (pointerInBlockUi) return current
  if (current && isWithinBlockHoverCorridor(current, pointer)) return current
  if (candidate && isWithinActivationGutter(candidate, pointer)) {
    return sameBlock(current, candidate) ? current : candidate
  }
  return null
}

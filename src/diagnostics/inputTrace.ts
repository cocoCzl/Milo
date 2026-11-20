import { invoke } from '@tauri-apps/api/core'

// Explicit diagnostic build only. Text is allowed only for the exact disposable
// fixture compiled into that build; other documents retain length-only records.
export const inputTraceEnabled = import.meta.env.VITE_MILO_INPUT_TRACE === '1'
const fixturePath = import.meta.env.VITE_MILO_INPUT_TRACE_PATH as string | undefined
export const isInputTraceDocument = (path: string | null | undefined) =>
  inputTraceEnabled &&
  Boolean(fixturePath?.startsWith('/private/tmp/milo-ime-')) &&
  path === fixturePath
export const scopedInputText = (scoped: boolean, text: string | null | undefined) =>
  inputTraceEnabled && scoped ? (text?.slice(0, 256) ?? null) : null
const targets = new WeakMap<Element, () => string | null | undefined>()
export function registerInputTraceTarget(root: Element, path: () => string | null | undefined) {
  if (!inputTraceEnabled) return () => {}
  targets.set(root, path)
  return () => {
    targets.delete(root)
  }
}
export function isScopedInputTarget(target: Element | null) {
  const root = target?.closest('.ProseMirror')
  return root != null && isInputTraceDocument(targets.get(root)?.())
}
type Fields = Record<string, string | number | boolean | null>
const events: (Fields & { at: number; event: string })[] = []
let dropped = 0
let sequence = 0
let closeId: string | null = null
const versions = new WeakMap<object, number>()
let nextVersion = 0
export function inputTraceVersion(value: object) {
  if (!inputTraceEnabled) return 0
  let version = versions.get(value)
  if (version === undefined) versions.set(value, (version = ++nextVersion))
  return version
}
export function setInputTraceClose(id: string | null) {
  if (inputTraceEnabled) closeId = id
}
export function traceInput(event: string, fields: Fields = {}) {
  if (!inputTraceEnabled) return
  if (events.length === 2048) {
    events.shift()
    dropped++
  }
  const at = performance.now()
  events.push({
    at,
    unixMs: performance.timeOrigin + at,
    sequence: ++sequence,
    closeId,
    event,
    ...fields,
  })
}

export async function flushInputTrace(reason: string) {
  if (!inputTraceEnabled) return
  const batch = events.splice(0)
  const droppedCount = dropped
  dropped = 0
  try {
    await invoke('record_open_profile', {
      record: {
        kind: 'input-trace',
        reason,
        timeOrigin: performance.timeOrigin,
        build: import.meta.env.VITE_MILO_PROFILE_COMMIT ?? 'unspecified',
        dropped: droppedCount,
        events: batch,
      },
    })
  } catch {
    console.error('Could not write input trace')
  }
}

export function installInputTrace() {
  if (!inputTraceEnabled) return
  const types = [
    'focusin',
    'focusout',
    'compositionstart',
    'compositionupdate',
    'compositionend',
    'beforeinput',
    'input',
    'keydown',
    'keyup',
    'focus',
    'blur',
    'visibilitychange',
  ]
  const observe = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null
    const keyboard = event instanceof KeyboardEvent ? event : null
    const input = event instanceof InputEvent ? event : null
    traceInput(`dom:${event.type}`, {
      panel: target?.closest('.document-panel')?.id ?? '',
      target: target?.closest('.ProseMirror') ? 'wys' : (target?.tagName ?? ''),
      // CompositionEvent has no isComposing property; null means unavailable.
      composing: keyboard?.isComposing ?? input?.isComposing ?? null,
      defaultPrevented: event.defaultPrevented,
      commandCode:
        keyboard &&
        (keyboard.metaKey || keyboard.ctrlKey) &&
        ['KeyS', 'KeyQ'].includes(keyboard.code)
          ? keyboard.code
          : '',
      inputType: input?.inputType ?? '',
      dataLength:
        event instanceof CompositionEvent || event instanceof InputEvent
          ? (event.data?.length ?? 0)
          : null,
      data: scopedInputText(
        isScopedInputTarget(target),
        event instanceof CompositionEvent || event instanceof InputEvent ? event.data : null,
      ),
      documentFocused: document.hasFocus(),
      visibility: document.visibilityState,
      // Named control keys and modifier-command names only, never typed text.
      key: keyboard
        ? keyboard.key.length > 1
          ? [
              'Enter',
              'Escape',
              'Backspace',
              'Delete',
              'Tab',
              'ArrowUp',
              'ArrowDown',
              'ArrowLeft',
              'ArrowRight',
              'Home',
              'End',
              'Shift',
              'Control',
              'Alt',
              'Meta',
              'Unidentified',
              'Process',
            ].includes(keyboard.key)
            ? keyboard.key
            : 'other'
          : (keyboard.metaKey || keyboard.ctrlKey) &&
              ['s', 'q'].includes(keyboard.key.toLowerCase())
            ? keyboard.key.toLowerCase()
            : 'printable'
        : '',
      meta: keyboard?.metaKey ?? false,
      ctrl: keyboard?.ctrlKey ?? false,
      alt: keyboard?.altKey ?? false,
      shift: keyboard?.shiftKey ?? false,
      trusted: event.isTrusted,
    })
    if (
      keyboard?.type === 'keydown' &&
      keyboard.metaKey &&
      keyboard.altKey &&
      keyboard.shiftKey &&
      keyboard.code === 'KeyI'
    ) {
      event.preventDefault()
      void flushInputTrace('shortcut')
    }
  }
  types.forEach((type) => window.addEventListener(type, observe, true))
  return () => types.forEach((type) => window.removeEventListener(type, observe, true))
}

import { invoke } from '@tauri-apps/api/core'

// Explicit diagnostic build only. Bounded in-memory events; never text, paths,
// selection text, composition data, or printable keys. Flush is user-triggered.
const enabled = import.meta.env.VITE_MILO_INPUT_TRACE === '1'
type Fields = Record<string, string | number | boolean | null>
const events: (Fields & { at: number; event: string })[] = []
let dropped = 0
export function traceInput(event: string, fields: Fields = {}) {
  if (!enabled) return
  if (events.length === 2048) {
    events.shift()
    dropped++
  }
  events.push({ at: performance.now(), event, ...fields })
}

export function installInputTrace() {
  if (!enabled) return
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
  ]
  const observe = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null
    const keyboard = event instanceof KeyboardEvent ? event : null
    const input = event instanceof InputEvent ? event : null
    traceInput(`dom:${event.type}`, {
      panel: target?.closest('.document-panel')?.id ?? '',
      target: target?.closest('.ProseMirror') ? 'wys' : (target?.tagName ?? ''),
      composing: keyboard?.isComposing ?? input?.isComposing ?? false,
      inputType: input?.inputType ?? '',
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
      const batch = events.splice(0)
      void invoke('record_open_profile', {
        record: {
          kind: 'input-trace',
          timeOrigin: performance.timeOrigin,
          build: import.meta.env.VITE_MILO_PROFILE_COMMIT ?? 'unspecified',
          dropped,
          events: batch,
        },
      }).catch(() => console.error('Could not write input trace'))
      dropped = 0
    }
  }
  types.forEach((type) => window.addEventListener(type, observe, true))
  return () => types.forEach((type) => window.removeEventListener(type, observe, true))
}

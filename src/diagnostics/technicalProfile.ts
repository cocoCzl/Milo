import { recordProfile } from './profileClock'

// Opt-in local acceptance build. No paths, document content or printable keys
// enter these bounded records. Normal releases eliminate all collection.
const enabled = import.meta.env.VITE_MILO_TECH_PROFILE === '1'
const openProbeEnabled = import.meta.env.VITE_MILO_OPEN_PROBE === '1'
const openProbeMarker = 'zOPENprobez'
const modelChecks = new WeakMap<HTMLElement, () => boolean>()
export function registerTechnicalInputTarget(
  element: HTMLElement,
  contains: (text: string) => boolean,
) {
  if (openProbeEnabled) modelChecks.set(element, () => contains(openProbeMarker))
}
type Entry = { stage: string; at: number; ms?: number; [key: string]: unknown }
let entries: Entry[] = []
export function technicalMark(stage: string, fields: Record<string, unknown> = {}) {
  if (!enabled || entries.length >= 10000) return
  entries.push({ stage, at: performance.now(), ...fields })
}
export function technicalMeasure<T>(stage: string, operation: () => T): T {
  if (!enabled) return operation()
  const at = performance.now()
  try {
    return operation()
  } finally {
    technicalMark(stage, { ms: performance.now() - at })
  }
}
export function technicalCommit(
  _id: string,
  phase: string,
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
) {
  technicalMark('react-commit', { phase, actualDuration, baseDuration, startTime, commitTime })
}
export function installTechnicalProfile() {
  if (!enabled) return
  if (openProbeEnabled) {
    const attempted = new WeakSet<HTMLElement>()
    const completed = new WeakSet<HTMLElement>()
    window.setInterval(() => {
      const target = document.querySelector<HTMLElement>(
        '.document-panel:not([hidden]) .ProseMirror[contenteditable="true"]',
      )
      if (
        !target ||
        completed.has(target) ||
        !target.firstElementChild?.textContent?.includes('OPEN_TARGET_')
      )
        return
      if (!attempted.has(target)) {
        if (document.activeElement !== target) return
        attempted.add(target)
        // Exercise the browser's editing path; readiness alone is never the
        // endpoint. The next check must find this input in EditorState too.
        document.execCommand('insertText', false, openProbeMarker)
      }
      if (!modelChecks.get(target)?.()) return
      completed.add(target)
      technicalMark('open-probe-accepted', {
        panel: target.closest('.document-panel')?.id,
        modelVerified: true,
        epochMs: Date.now(),
        pollIntervalMs: 10,
      })
      const batch = entries
      entries = []
      void recordProfile({ kind: 'technical', entries: batch })
    }, 10)
  }
  let before = 0
  let minimal: HTMLTextAreaElement | null = null
  const observe = (event: Event) => {
    const input = event as InputEvent
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (!target.matches('textarea, .ProseMirror')) return
    if (event.type === 'beforeinput') before = performance.now()
    else {
      // An input event alone is insufficient: verify that its committed text
      // really occupies the target's current insertion boundary. Inspect only
      // the local selection node, never the full long document in this clock.
      const data = input.data
      const selection = target instanceof HTMLTextAreaElement ? null : getSelection()
      const accepted =
        !!data &&
        (target instanceof HTMLTextAreaElement
          ? target.value.slice(target.selectionEnd - data.length, target.selectionEnd) === data
          : selection?.anchorNode?.textContent?.slice(
              selection.anchorOffset - data.length,
              selection.anchorOffset,
            ) === data)
      const fields = {
        ms: performance.now() - before,
        accepted,
        trusted: event.isTrusted,
        composing: input.isComposing,
        target: target === minimal ? 'minimal' : target.tagName === 'TEXTAREA' ? 'source' : 'wys',
        panel: target.closest('.document-panel')?.id ?? '',
        activePanel: document.querySelector('.document-panel:not([hidden])')?.id ?? '',
      }
      technicalMark('input-event', fields)
      queueMicrotask(() =>
        technicalMark('input-microtask', { ...fields, ms: performance.now() - before }),
      )
    }
  }
  document.addEventListener('beforeinput', observe, true)
  document.addEventListener('input', observe)
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.code === 'Tab' && !event.isComposing)
      technicalMark('tab-switch-key', { backward: event.shiftKey })
    if (!(event.metaKey && event.altKey && event.shiftKey) || event.isComposing) return
    if (event.code === 'KeyJ') {
      event.preventDefault()
      technicalMark('epoch-clock', { epochMs: Date.now() })
      const batch = entries
      entries = []
      void recordProfile({ kind: 'technical', entries: batch })
    }
    if (event.code === 'KeyT') {
      event.preventDefault()
      if (minimal) {
        minimal.remove()
        minimal = null
        document
          .querySelector<HTMLTextAreaElement>('.document-panel:not([hidden]) textarea')
          ?.focus()
        return
      }
      const original = document.querySelector<HTMLTextAreaElement>(
        '.document-panel:not([hidden]) textarea',
      )
      if (!original) return
      minimal = original.cloneNode(false) as HTMLTextAreaElement
      minimal.value = original.value
      minimal.setAttribute('aria-label', 'Technical minimal textarea')
      minimal.style.cssText = `${getComputedStyle(original).cssText};position:fixed;inset:80px 24px 24px;width:calc(100% - 48px);height:calc(100% - 104px);z-index:9999;font:16.5px/1.7 monospace;`
      minimal.readOnly = false
      document.body.append(minimal)
      minimal.focus()
      minimal.setSelectionRange(minimal.value.length, minimal.value.length)
    }
  })
}

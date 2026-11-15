// One pending native input per view; no text, timer, layout read or per-key IPC.
export function createInputResponseProbe(
  now: () => number,
  record: (stage: string, ms: number) => void,
) {
  let keyAt: number | undefined
  let inputAt: number | undefined
  let inputType = ''
  const reset = () => {
    keyAt = undefined
    inputAt = undefined
  }
  return {
    reset,
    keydown(
      event: Pick<
        KeyboardEvent,
        'isTrusted' | 'isComposing' | 'metaKey' | 'ctrlKey' | 'altKey' | 'key'
      >,
    ) {
      reset()
      if (
        event.isTrusted &&
        !event.isComposing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.length === 1
      )
        keyAt = now()
    },
    beforeinput(event: Pick<InputEvent, 'isTrusted' | 'isComposing' | 'inputType'>) {
      if (event.isTrusted && !event.isComposing) {
        inputAt = now()
        inputType = event.inputType
      } else reset()
    },
    modelChanged() {
      const end = now()
      if (keyAt !== undefined) record('input-keydown-to-model', end - keyAt)
      if (inputAt !== undefined) record(`input-beforeinput-${inputType}-to-model`, end - inputAt)
      reset()
    },
  }
}

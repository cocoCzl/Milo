// A positive browser input signal, not elapsed time, blur or a navigation key.
// WebKit can omit compositionend across focus changes. Ordinary input then
// provides evidence that the browser is no longer editing marked text.
export function isNonCompositionInput(event: InputEvent) {
  return (
    event.isComposing === false &&
    Boolean(event.inputType) &&
    (event.inputType === 'insertFromComposition' || !event.inputType.includes('Composition'))
  )
}

import type { NodeViewConstructor } from '@milkdown/prose/view'
import type { MutableRefObject } from 'react'
import type { PresentationMode } from '../../app/presentationMode'
import type { EditorCopy } from './editorCopy'

type CodeBlockCopy = Pick<EditorCopy, 'codeBlock' | 'codeBlockLanguage' | 'plainText' | 'copy'>

const languageOptions = [
  { value: '', label: '' },
  { value: 'bash', label: 'Bash' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
]

export function createCodeBlockNodeView(
  copyRef: MutableRefObject<CodeBlockCopy>,
  presentationModeRef: MutableRefObject<PresentationMode>,
): NodeViewConstructor {
  return (node, editorView, getPos) => {
    const card = document.createElement('section')
    const header = document.createElement('header')
    const label = document.createElement('span')
    const languageTrigger = document.createElement('button')
    const languageMenu = document.createElement('div')
    const copyButton = document.createElement('button')
    // Safari/WKWebView can replace the nested <code> element while composing
    // inside a <pre>.  Keep the content DOM at the stable <pre> boundary so
    // ProseMirror observes those content mutations instead of mistaking them
    // for NodeView chrome.
    const contentDOM = document.createElement('pre')

    card.className = 'code-block-card'
    header.className = 'code-block-card__header'
    label.className = 'code-block-card__label'
    languageTrigger.className = 'code-block-card__language-trigger'
    languageTrigger.type = 'button'
    languageTrigger.setAttribute('aria-haspopup', 'listbox')
    languageTrigger.setAttribute('aria-expanded', 'false')
    languageMenu.className = 'code-block-card__language-menu'
    languageMenu.setAttribute('role', 'listbox')
    languageMenu.hidden = true
    copyButton.className = 'code-block-card__copy'
    copyButton.type = 'button'
    contentDOM.className = 'code-block-card__content'

    const closeLanguageMenu = () => {
      languageMenu.hidden = true
      languageTrigger.setAttribute('aria-expanded', 'false')
    }

    const updateControls = (nextNode = node) => {
      const selected = String(nextNode.attrs.language ?? '')
      const selectedOption =
        languageOptions.find((option) => option.value === selected) ?? languageOptions[0]
      const selectedLabel = selectedOption.value ? selectedOption.label : copyRef.current.plainText
      card.dataset.language = selected
      label.textContent = copyRef.current.codeBlock
      languageTrigger.textContent = selectedLabel
      languageTrigger.setAttribute(
        'aria-label',
        `${copyRef.current.codeBlockLanguage}: ${selectedLabel}`,
      )
      languageTrigger.disabled = presentationModeRef.current !== 'edit'
      copyButton.setAttribute('aria-label', copyRef.current.copy)
      copyButton.title = copyRef.current.copy

      for (const option of languageMenu.querySelectorAll<HTMLButtonElement>('[role="option"]')) {
        option.setAttribute(
          'aria-selected',
          String(option.dataset.language === selectedOption.value),
        )
      }
    }

    for (const option of languageOptions) {
      const optionButton = document.createElement('button')
      const optionLabel = option.value ? option.label : copyRef.current.plainText
      optionButton.type = 'button'
      optionButton.dataset.language = option.value
      optionButton.setAttribute('role', 'option')
      optionButton.textContent = optionLabel
      optionButton.addEventListener('click', () => {
        if (presentationModeRef.current !== 'edit') return
        const position = getPos()
        if (typeof position === 'number') {
          editorView.dispatch(
            editorView.state.tr.setNodeAttribute(position, 'language', option.value),
          )
        }
        closeLanguageMenu()
      })
      languageMenu.append(optionButton)
    }

    languageTrigger.addEventListener('click', () => {
      if (presentationModeRef.current !== 'edit') return
      const isOpening = languageMenu.hidden
      languageMenu.hidden = !isOpening
      languageTrigger.setAttribute('aria-expanded', String(isOpening))
    })
    copyButton.addEventListener(
      'click',
      () => void navigator.clipboard?.writeText(node.textContent),
    )

    const closeMenuOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !card.contains(event.target)) closeLanguageMenu()
    }
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLanguageMenu()
    }
    document.addEventListener('pointerdown', closeMenuOnOutsidePress)
    document.addEventListener('keydown', closeMenuOnEscape)

    header.append(label, languageTrigger, copyButton, languageMenu)
    card.append(header, contentDOM)
    updateControls()

    return {
      dom: card,
      contentDOM,
      update: (nextNode) => {
        if (nextNode.type !== node.type) return false
        node = nextNode
        updateControls(nextNode)
        return true
      },
      // Header controls are NodeView chrome. Every mutation at or below the
      // content <pre> can affect authored code and must reach ProseMirror.
      ignoreMutation: (mutation) => !contentDOM.contains(mutation.target),
      stopEvent: (event) => event.target instanceof Node && header.contains(event.target),
      destroy: () => {
        document.removeEventListener('pointerdown', closeMenuOnOutsidePress)
        document.removeEventListener('keydown', closeMenuOnEscape)
      },
    }
  }
}

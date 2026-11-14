import type { NodeViewConstructor } from '@milkdown/prose/view'
import type { MutableRefObject } from 'react'
import type { PresentationMode } from '../../app/presentationMode'
import type { EditorCopy } from './editorCopy'

type CodeBlockCopy = Pick<
  EditorCopy,
  'codeBlock' | 'codeBlockLanguage' | 'plainText' | 'copy' | 'copied' | 'copyFailed'
>

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

const aliases: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  html: 'html',
  jsx: 'javascript',
  tsx: 'typescript',
}
let openMenu: { card: HTMLElement; close: () => void } | null = null
export function closeCodeBlockMenu(root: HTMLElement | null) {
  if (root && openMenu && root.contains(openMenu.card)) openMenu.close()
}

export function createCodeBlockNodeView(
  copyRef: MutableRefObject<CodeBlockCopy>,
  presentationModeRef: MutableRefObject<PresentationMode>,
): NodeViewConstructor {
  return (node, editorView, getPos) => {
    const card = document.createElement('section')
    const header = document.createElement('header')
    const label = document.createElement('span')
    const languageTrigger = document.createElement('button')
    let languageMenu: HTMLDivElement | null = null
    let feedbackTimer: number | undefined
    let destroyed = false
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
    copyButton.className = 'code-block-card__copy'
    copyButton.type = 'button'
    contentDOM.className = 'code-block-card__content'

    const closeLanguageMenu = () => {
      languageMenu?.remove()
      languageMenu = null
      if (openMenu?.card === card) openMenu = null
      document.removeEventListener('pointerdown', closeMenuOnOutsidePress)
      document.removeEventListener('keydown', closeMenuOnEscape)
      languageTrigger.setAttribute('aria-expanded', 'false')
    }

    const updateControls = (nextNode = node) => {
      const selected = String(nextNode.attrs.language ?? '')
      const selectedOption = languageOptions.find(
        (option) => option.value === (aliases[selected.toLowerCase()] ?? selected.toLowerCase()),
      )
      const selectedLabel = selected
        ? (selectedOption?.label ?? selected)
        : copyRef.current.plainText
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

      for (const option of languageMenu?.querySelectorAll<HTMLButtonElement>('[role="option"]') ??
        []) {
        option.setAttribute(
          'aria-selected',
          String(option.dataset.language === selectedOption?.value),
        )
      }
    }

    const showLanguageMenu = (focus = false) => {
      if (presentationModeRef.current !== 'edit' || !editorView.editable) return
      if (languageMenu) {
        closeLanguageMenu()
        return
      }
      openMenu?.close()
      languageMenu = document.createElement('div')
      languageMenu.className = 'code-block-card__language-menu'
      languageMenu.setAttribute('role', 'listbox')
      languageMenu.setAttribute('aria-label', copyRef.current.codeBlockLanguage)
      for (const option of languageOptions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.language = option.value
        button.setAttribute('role', 'option')
        button.textContent = option.value ? option.label : copyRef.current.plainText
        button.addEventListener('click', () => {
          if (presentationModeRef.current !== 'edit' || !editorView.editable) return
          const position = getPos()
          if (typeof position === 'number')
            editorView.dispatch(
              editorView.state.tr.setNodeAttribute(position, 'language', option.value),
            )
          closeLanguageMenu()
          languageTrigger.focus()
        })
        languageMenu.append(button)
      }
      languageMenu.addEventListener('keydown', (event) => {
        const buttons = [...languageMenu!.querySelectorAll<HTMLButtonElement>('button')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next =
          event.key === 'ArrowDown'
            ? (index + 1) % buttons.length
            : event.key === 'ArrowUp'
              ? (index - 1 + buttons.length) % buttons.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : -1
        if (next >= 0) {
          event.preventDefault()
          buttons[next].focus()
        }
        if (event.key === 'Tab') closeLanguageMenu()
      })
      header.append(languageMenu)
      openMenu = { card, close: closeLanguageMenu }
      languageTrigger.setAttribute('aria-expanded', 'true')
      document.addEventListener('pointerdown', closeMenuOnOutsidePress)
      document.addEventListener('keydown', closeMenuOnEscape)
      updateControls()
      if (focus)
        (
          languageMenu.querySelector<HTMLButtonElement>('[aria-selected="true"]') ??
          languageMenu.querySelector<HTMLButtonElement>('button')
        )?.focus()
    }
    languageTrigger.addEventListener('click', () => showLanguageMenu())
    languageTrigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        showLanguageMenu(true)
      }
    })
    copyButton.addEventListener('click', () => {
      const operation = navigator.clipboard
        ? navigator.clipboard.writeText(node.textContent)
        : Promise.reject(new Error('Clipboard unavailable'))
      void operation.then(
        () => feedback(copyRef.current.copied),
        () => feedback(copyRef.current.copyFailed),
      )
    })
    const feedback = (message: string) => {
      if (destroyed) return
      window.clearTimeout(feedbackTimer)
      copyButton.textContent = message
      copyButton.setAttribute('aria-label', message)
      copyButton.setAttribute('role', 'status')
      feedbackTimer = window.setTimeout(() => {
        copyButton.textContent = ''
        copyButton.removeAttribute('role')
        updateControls()
      }, 2400)
    }

    const closeMenuOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !card.contains(event.target)) closeLanguageMenu()
    }
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeLanguageMenu()
        languageTrigger.focus()
      }
    }

    header.append(label, languageTrigger, copyButton)
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
        destroyed = true
        window.clearTimeout(feedbackTimer)
        closeLanguageMenu()
      },
    }
  }
}

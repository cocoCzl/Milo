import { defaultValueCtx, Editor, editorViewCtx, nodeViewCtx, prosePluginsCtx, rootCtx, type CmdKey } from '@milkdown/core'
import { convertFileSrc, isTauri } from '@tauri-apps/api/core'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { prism } from '@milkdown/plugin-prism'
import {
  commonmark,
  createCodeBlockCommand,
  insertHrCommand,
  liftListItemCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark'
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  gfm,
  insertTableCommand,
  toggleStrikethroughCommand,
} from '@milkdown/preset-gfm'
import { lift, splitBlockAs } from '@milkdown/prose/commands'
import { Plugin, TextSelection, type Command, type EditorState } from '@milkdown/prose/state'
import { deleteColumn, deleteRow } from '@milkdown/prose/tables'
import type { EditorView, NodeViewConstructor } from '@milkdown/prose/view'
import { callCommand } from '@milkdown/utils'
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { PastedImage } from '../../file-system/nativeMarkdownFile'
import { isExternalHttpUrl, openExternalLink } from '../../file-system/externalLink'
import { EditorContextMenu, type EditorContextMenuCopy } from './EditorContextMenu'
import { EditorOutline, type EditorHeading } from './EditorOutline'
import {
  EditorToolbar,
  type EditorBlockType,
  type EditorToolbarCommand,
  type EditorToolbarCopy,
  type EditorToolbarState,
} from './EditorToolbar'

type EditorMenu = {
  hasSelection: boolean
  inTable: boolean
  top: number
  left: number
}

type MilkdownEditorProps = {
  ariaLabel?: string
  copy?: Partial<EditorCopy>
  documentPath?: string | null
  initialMarkdown: string
  onMarkdownChange?: (markdown: string) => void
  onPasteImage?: (image: PastedImage) => Promise<string | null>
  placeholder?: string
}

type EditorCopy = EditorToolbarCopy & EditorContextMenuCopy & {
  addColumnLeft: string
  addColumnRight: string
  addRowAbove: string
  addRowBelow: string
  codeBlockLanguage: string
  deleteColumn: string
  deleteRow: string
  loadImage: string
  loadImageError: string
  loadRemoteImage: (alt: string) => string
  loadingImage: string
  noOutline: string
  outline: string
  plainText: string
  startWritingHint: string
  startWriting: string
}

const defaultEditorCopy: EditorCopy = {
  apply: 'Apply', blockquote: 'Quote', bold: 'Bold', bulletList: 'Bulleted list', cancel: 'Cancel', codeBlock: 'Code block',
  copy: 'Copy', cut: 'Cut', divider: 'Divider', formattingToolbar: 'Formatting', heading1: 'Heading 1', heading2: 'Heading 2', heading3: 'Heading 3',
  inlineCode: 'Inline code', italic: 'Italic', link: 'Link', linkAddress: 'Link address', orderedList: 'Numbered list', paragraph: 'Body text',
  paste: 'Paste', selectAll: 'Select all', strike: 'Strikethrough', table: 'Table', textStyle: 'Text style',
  addColumnLeft: 'Add column left', addColumnRight: 'Add column right', addRowAbove: 'Add row above', addRowBelow: 'Add row below',
  codeBlockLanguage: 'Code block language', deleteColumn: 'Delete column', deleteRow: 'Delete row', loadImage: 'Load image',
  loadImageError: 'Could not load image — try again', loadRemoteImage: (alt) => `Load remote image${alt ? `: ${alt}` : ''}`,
  loadingImage: 'Loading image…', noOutline: 'Headings will appear here.', outline: 'Outline', plainText: 'Plain text', startWriting: 'Start with a thought…',
  startWritingHint: 'Just type — Milo keeps the Markdown for you.',
}

const defaultToolbarState: EditorToolbarState = {
  blockType: 'paragraph', bold: false, bulletList: false, emphasis: false, hasSelection: false,
  inlineCode: false, link: false, orderedList: false, strike: false,
}

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

function syncProseMirrorSelectionFromDOM(editorView: EditorView) {
  const domSelection = editorView.dom.ownerDocument.getSelection()

  if (
    !domSelection?.anchorNode
    || !domSelection.focusNode
    || !editorView.dom.contains(domSelection.anchorNode)
    || !editorView.dom.contains(domSelection.focusNode)
  ) return

  try {
    const selection = TextSelection.between(
      editorView.state.doc.resolve(editorView.posAtDOM(domSelection.anchorNode, domSelection.anchorOffset)),
      editorView.state.doc.resolve(editorView.posAtDOM(domSelection.focusNode, domSelection.focusOffset)),
    )

    if (!selection.eq(editorView.state.selection)) {
      editorView.dispatch(editorView.state.tr.setSelection(selection))
    }
  } catch {
    // A browser can briefly expose a DOM selection while replacing a node.
    // Keep the editor's last valid ProseMirror selection in that case.
  }
}

const exitHeadingAsParagraph: Command = (state, dispatch) => {
  const { selection } = state
  let headingStart: number | null = null

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    if (selection.$from.node(depth).type.name === 'heading') {
      headingStart = selection.$from.before(depth)
      break
    }
  }

  const paragraph = state.schema.nodes.paragraph
  if (headingStart === null || !paragraph) return false

  return splitBlockAs(() => ({ type: paragraph }))(state, (transaction) => {
    const mappedHeadingStart = transaction.mapping.map(headingStart, -1)
    const heading = transaction.doc.nodeAt(mappedHeadingStart)
    const paragraphStart = heading ? mappedHeadingStart + heading.nodeSize : -1
    const nextBlock = paragraphStart >= 0 ? transaction.doc.nodeAt(paragraphStart) : null

    if (nextBlock?.type === paragraph) {
      transaction.setSelection(TextSelection.create(transaction.doc, paragraphStart + 1))
    }

    dispatch?.(transaction.scrollIntoView())
  })
}

export function MilkdownEditor({
  ariaLabel = 'Untitled Markdown document',
  copy,
  documentPath = null,
  initialMarkdown,
  onMarkdownChange,
  onPasteImage,
  placeholder,
}: MilkdownEditorProps) {
  const editorCopy = useMemo(() => ({ ...defaultEditorCopy, ...copy }), [copy])
  const editorRootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const initialMarkdownRef = useRef(initialMarkdown)
  const ariaLabelRef = useRef(ariaLabel)
  const copyRef = useRef(editorCopy)
  const documentPathRef = useRef(documentPath)
  const onMarkdownChangeRef = useRef(onMarkdownChange)
  const onPasteImageRef = useRef(onPasteImage)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<EditorMenu | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [headings, setHeadings] = useState<EditorHeading[]>([])
  const [linkEditorOpen, setLinkEditorOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [toolbarState, setToolbarState] = useState<EditorToolbarState>(defaultToolbarState)

  onMarkdownChangeRef.current = onMarkdownChange
  onPasteImageRef.current = onPasteImage
  ariaLabelRef.current = ariaLabel
  copyRef.current = editorCopy
  documentPathRef.current = documentPath

  useEffect(() => {
    const editorRoot = editorRootRef.current

    if (!editorRoot) {
      return undefined
    }

    let disposed = false
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, editorRoot)
        ctx.set(defaultValueCtx, initialMarkdownRef.current)
        ctx.update(prosePluginsCtx, (plugins) => [
          new Plugin({
            props: {
              handleKeyDown: (editorView, event) => {
                if (
                  event.key !== 'Enter'
                  || event.shiftKey
                  || event.altKey
                  || event.ctrlKey
                  || event.metaKey
                  || editorView.composing
                ) return false

                syncProseMirrorSelectionFromDOM(editorView)
                return exitHeadingAsParagraph(editorView.state, editorView.dispatch)
              },
            },
          }),
          ...plugins,
        ])
        ctx.update(nodeViewCtx, (views) => [
          ...views,
          ['code_block', createCodeBlockNodeView(copyRef)] as [string, NodeViewConstructor],
          ['image', createImageNodeView(documentPathRef, copyRef)] as [string, NodeViewConstructor],
        ])
        ctx.get(listenerCtx).markdownUpdated((updateCtx, markdown) => {
          if (!disposed) {
            onMarkdownChangeRef.current?.(markdown)
            const editorView = updateCtx.get(editorViewCtx)
            if (editorView.state) setHeadings(readHeadings(editorView.state))
          }
        })
        ctx.get(listenerCtx).selectionUpdated((selectionCtx) => {
          if (disposed) {
            return
          }

          const editorView = selectionCtx.get(editorViewCtx)
          if (!editorView.state) return
          queueMicrotask(() => {
            const currentView = selectionCtx.get(editorViewCtx)
            if (!disposed && currentView.state) setToolbarState(readToolbarState(currentView.state))
          })
          setContextMenu(null)
        })
      })
      .use(commonmark)
      .use(gfm)
      .use(prism)
      .use(history)
      .use(listener)

    editorRef.current = editor

    void editor.create().then(() => {
      if (disposed) {
        void editor.destroy()
        return
      }

      const proseMirror = editorRoot.querySelector<HTMLElement>('.ProseMirror')

      proseMirror?.setAttribute(
        'aria-label',
        ariaLabelRef.current,
      )
      proseMirror?.focus()
      editor.action((ctx) => {
        const editorState = ctx.get(editorViewCtx).state
        setToolbarState(readToolbarState(editorState))
        setHeadings(readHeadings(editorState))
      })
      setIsReady(true)
    })

    return () => {
      disposed = true
      editorRef.current = null
      void editor.destroy()
    }
  }, [])

  useEffect(() => {
    editorRootRef.current?.querySelector<HTMLElement>('.ProseMirror')?.setAttribute('aria-label', ariaLabel)
  }, [ariaLabel])

  useEffect(() => {
    if (!contextMenu) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target)) setContextMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  const insertImage = useCallback((src: string) => {
    editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      const image = editorView.state.schema.nodes.image
      if (!image) return
      editorView.dispatch(editorView.state.tr.replaceSelectionWith(image.create({ src, alt: '' })).scrollIntoView())
    })
  }, [])

  const pasteImage = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'))
    if (!image || !onPasteImageRef.current) return
    event.preventDefault()
    void image.arrayBuffer().then((buffer) => onPasteImageRef.current?.({
      bytes: Array.from(new Uint8Array(buffer)),
      mimeType: image.type,
    })).then((relativePath) => {
      if (relativePath) insertImage(relativePath)
    })
  }, [insertImage])

  const openLinkOnCommandClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const link = target.closest<HTMLAnchorElement>('a[href]')
    const url = link?.getAttribute('href')
    if (!url || !isExternalHttpUrl(url)) return
    event.preventDefault()
    if (event.metaKey || event.ctrlKey) void openExternalLink(url)
  }, [])

  const focusEditor = useCallback(() => {
    editorRootRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus()
  }, [])

  const refreshToolbarState = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    setToolbarState(editor.action((ctx) => readToolbarState(ctx.get(editorViewCtx).state)))
  }, [])

  const syncEditorSelectionFromDOM = useCallback(() => editorRef.current?.action((ctx) => {
    const editorView = ctx.get(editorViewCtx)
    syncProseMirrorSelectionFromDOM(editorView)
    return readToolbarState(editorView.state).blockType
  }), [])

  const selectHeading = useCallback((heading: EditorHeading) => {
    editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      const position = Math.min(heading.position + 1, editorView.state.doc.content.size)
      const selection = TextSelection.near(editorView.state.doc.resolve(position))
      editorView.dispatch(editorView.state.tr.setSelection(selection).scrollIntoView())
      editorView.focus()
    })
  }, [])

  const runEditorCommand = useCallback(<T,>(command: CmdKey<T>, payload?: T) => {
    syncEditorSelectionFromDOM()
    editorRef.current?.action(callCommand(command, payload))
    refreshToolbarState()
    focusEditor()
  }, [focusEditor, refreshToolbarState, syncEditorSelectionFromDOM])

  const runProseCommand = useCallback((command: Command) => {
    syncEditorSelectionFromDOM()
    editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      return command(editorView.state, editorView.dispatch)
    })
    refreshToolbarState()
    focusEditor()
  }, [focusEditor, refreshToolbarState, syncEditorSelectionFromDOM])

  const changeBlockType = useCallback((blockType: EditorBlockType) => {
    const currentBlockType = syncEditorSelectionFromDOM() ?? toolbarState.blockType
    if (currentBlockType === 'blockquote' && blockType !== 'blockquote') runProseCommand(lift)

    switch (blockType) {
      case 'paragraph': runEditorCommand(turnIntoTextCommand.key); break
      case 'heading-1': runEditorCommand(wrapInHeadingCommand.key, 1); break
      case 'heading-2': runEditorCommand(wrapInHeadingCommand.key, 2); break
      case 'heading-3': runEditorCommand(wrapInHeadingCommand.key, 3); break
      case 'blockquote': runEditorCommand(wrapInBlockquoteCommand.key); break
      case 'code-block': runEditorCommand(createCodeBlockCommand.key); break
    }
  }, [runEditorCommand, runProseCommand, syncEditorSelectionFromDOM, toolbarState.blockType])

  const runToolbarCommand = useCallback((command: EditorToolbarCommand) => {
    switch (command) {
      case 'bold': runEditorCommand(toggleStrongCommand.key); break
      case 'italic': runEditorCommand(toggleEmphasisCommand.key); break
      case 'strike': runEditorCommand(toggleStrikethroughCommand.key); break
      case 'inline-code': runEditorCommand(toggleInlineCodeCommand.key); break
      case 'bullet-list':
        runEditorCommand(toolbarState.bulletList ? liftListItemCommand.key : wrapInBulletListCommand.key)
        break
      case 'ordered-list':
        runEditorCommand(toolbarState.orderedList ? liftListItemCommand.key : wrapInOrderedListCommand.key)
        break
      case 'blockquote':
        if (toolbarState.blockType === 'blockquote') runProseCommand(lift)
        else runEditorCommand(wrapInBlockquoteCommand.key)
        break
      case 'link':
        if (toolbarState.link) runEditorCommand(toggleLinkCommand.key, {})
        else {
          setLinkUrl('')
          setLinkEditorOpen(true)
        }
        break
      case 'divider': runEditorCommand(insertHrCommand.key); break
      case 'table': runEditorCommand(insertTableCommand.key, { row: 3, col: 3 }); break
    }
  }, [runEditorCommand, runProseCommand, toolbarState])

  const applyLink = useCallback(() => {
    const href = linkUrl.trim()
    if (!href) return
    runEditorCommand(toggleLinkCommand.key, { href })
    setLinkEditorOpen(false)
  }, [linkUrl, runEditorCommand])

  const runTableCommand = useCallback((command: typeof addRowBeforeCommand) => {
    editorRef.current?.action(callCommand(command.key))
    setContextMenu(null)
    focusEditor()
  }, [focusEditor])

  const runTableProseCommand = useCallback((command: Command) => {
    editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      return command(editorView.state, editorView.dispatch)
    })
    setContextMenu(null)
    focusEditor()
  }, [focusEditor])

  const openEditorMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target
    const editor = editorRef.current
    if (!editor || !(target instanceof Element) || !target.closest('.ProseMirror')) return

    const menuState = editor.action((ctx) => {
      const selection = ctx.get(editorViewCtx).state.selection
      let inTable = false
      for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
        if (selection.$from.node(depth).type.name === 'table') {
          inTable = true
          break
        }
      }
      return { hasSelection: !selection.empty, inTable }
    })

    event.preventDefault()
    setContextMenu({
      ...menuState,
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - (menuState.inTable ? 420 : 250))),
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)),
    })
  }, [])

  const runContextCommand = useCallback((command: 'cut' | 'copy' | 'paste' | 'select-all' | 'bold' | 'italic') => {
    setContextMenu(null)
    focusEditor()
    if (command === 'bold') return runEditorCommand(toggleStrongCommand.key)
    if (command === 'italic') return runEditorCommand(toggleEmphasisCommand.key)
    if (command === 'select-all') {
      document.execCommand('selectAll')
      return
    }
    if (command === 'cut' || command === 'copy') {
      document.execCommand(command)
      return
    }

    if (document.execCommand('paste')) return
    const clipboard = navigator.clipboard
    if (!clipboard) return
    void clipboard.readText().then((text) => {
      focusEditor()
      document.execCommand('insertText', false, text)
    }).catch(() => undefined)
  }, [focusEditor, runEditorCommand])

  const runContextTableCommand = useCallback((command: 'row-before' | 'row-after' | 'column-before' | 'column-after' | 'delete-row' | 'delete-column') => {
    switch (command) {
      case 'row-before': runTableCommand(addRowBeforeCommand); break
      case 'row-after': runTableCommand(addRowAfterCommand); break
      case 'column-before': runTableCommand(addColBeforeCommand); break
      case 'column-after': runTableCommand(addColAfterCommand); break
      case 'delete-row': runTableProseCommand(deleteRow); break
      case 'delete-column': runTableProseCommand(deleteColumn); break
    }
  }, [runTableCommand, runTableProseCommand])

  const toggleTaskItem = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target

    if (!(target instanceof HTMLElement)) {
      return
    }

    const taskItem = target.closest<HTMLElement>('li[data-item-type="task"]')

    if (!taskItem || event.clientX > taskItem.getBoundingClientRect().left + 24) {
      return
    }

    const toggled = editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      const position = editorView.posAtDOM(taskItem, 0)
      const $position = editorView.state.doc.resolve(position)

      for (let depth = $position.depth; depth > 0; depth -= 1) {
        const node = $position.node(depth)

        if (node.type.name !== 'list_item' || typeof node.attrs.checked !== 'boolean') {
          continue
        }

        editorView.dispatch(
          editorView.state.tr.setNodeMarkup($position.before(depth), undefined, {
            ...node.attrs,
            checked: !node.attrs.checked,
          }),
        )
        return true
      }

      return false
    })

    if (toggled) {
      event.preventDefault()
    }
  }, [])

  return (
    <div
      ref={editorRootRef}
      aria-busy={!isReady}
      aria-label={ariaLabel}
      className="milkdown-editor"
      onClickCapture={openLinkOnCommandClick}
      onClick={toggleTaskItem}
      onContextMenu={openEditorMenu}
      onPasteCapture={pasteImage}
    >
      <EditorToolbar
        copy={editorCopy}
        linkEditorOpen={linkEditorOpen}
        linkUrl={linkUrl}
        state={toolbarState}
        onApplyLink={applyLink}
        onBlockChange={changeBlockType}
        onCancelLink={() => setLinkEditorOpen(false)}
        onCommand={runToolbarCommand}
        onLinkUrlChange={setLinkUrl}
      />
      <EditorOutline
        emptyLabel={editorCopy.noOutline}
        headings={headings}
        label={editorCopy.outline}
        onSelect={selectHeading}
      />
      <span aria-hidden="true" className="milkdown-editor__empty-state">
        <span className="milkdown-editor__placeholder">{placeholder ?? editorCopy.startWriting}</span>
        <span className="milkdown-editor__hint">{editorCopy.startWritingHint}</span>
      </span>
      {contextMenu ? (
        <EditorContextMenu
          ref={contextMenuRef}
          copy={editorCopy}
          hasSelection={contextMenu.hasSelection}
          inTable={contextMenu.inTable}
          position={{ left: contextMenu.left, top: contextMenu.top }}
          onCommand={runContextCommand}
          onTableCommand={runContextTableCommand}
        />
      ) : null}
    </div>
  )
}

function readToolbarState(state: EditorState): EditorToolbarState {
  const { selection } = state
  let blockType: EditorBlockType = 'paragraph'
  let bulletList = false
  let orderedList = false

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth)
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level)
      if (level >= 1 && level <= 3) blockType = `heading-${level}` as EditorBlockType
    }
    if (node.type.name === 'code_block') blockType = 'code-block'
    if (node.type.name === 'blockquote') blockType = 'blockquote'
    if (node.type.name === 'bullet_list') bulletList = true
    if (node.type.name === 'ordered_list') orderedList = true
  }

  const hasMark = (name: string) => {
    const mark = state.schema.marks[name]
    if (!mark) return false
    if (selection.empty) return Boolean(mark.isInSet(state.storedMarks ?? selection.$from.marks()))
    return state.doc.rangeHasMark(selection.from, selection.to, mark)
  }

  return {
    blockType,
    bold: hasMark('strong'),
    bulletList,
    emphasis: hasMark('emphasis'),
    hasSelection: !selection.empty,
    inlineCode: hasMark('inlineCode'),
    link: hasMark('link'),
    orderedList,
    strike: hasMark('strike_through'),
  }
}

function readHeadings(state: EditorState): EditorHeading[] {
  const headings: EditorHeading[] = []

  state.doc.descendants((node, position) => {
    if (node.type.name !== 'heading') return
    const text = node.textContent.trim()
    if (text) headings.push({ level: Number(node.attrs.level) || 1, position, text })
  })

  return headings
}

function createCodeBlockNodeView(copyRef: MutableRefObject<EditorCopy>): NodeViewConstructor {
  return (node, editorView, getPos) => {
    const card = document.createElement('section')
    const header = document.createElement('header')
    const label = document.createElement('span')
    const languageTrigger = document.createElement('button')
    const languageMenu = document.createElement('div')
    const copyButton = document.createElement('button')
    const pre = document.createElement('pre')
    const contentDOM = document.createElement('code')

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
    pre.className = 'code-block-card__content'

    const closeLanguageMenu = () => {
      languageMenu.hidden = true
      languageTrigger.setAttribute('aria-expanded', 'false')
    }

    const updateControls = (nextNode = node) => {
      const selected = String(nextNode.attrs.language ?? '')
      const selectedOption = languageOptions.find((option) => option.value === selected) ?? languageOptions[0]
      const selectedLabel = selectedOption.value ? selectedOption.label : copyRef.current.plainText
      card.dataset.language = selected
      label.textContent = copyRef.current.codeBlock
      languageTrigger.textContent = selectedLabel
      languageTrigger.setAttribute('aria-label', `${copyRef.current.codeBlockLanguage}: ${selectedLabel}`)
      copyButton.setAttribute('aria-label', copyRef.current.copy)
      copyButton.title = copyRef.current.copy

      for (const option of languageMenu.querySelectorAll<HTMLButtonElement>('[role="option"]')) {
        option.setAttribute('aria-selected', String(option.dataset.language === selectedOption.value))
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
        const position = getPos()
        if (typeof position === 'number') {
          editorView.dispatch(editorView.state.tr.setNodeAttribute(position, 'language', option.value))
        }
        closeLanguageMenu()
      })
      languageMenu.append(optionButton)
    }

    languageTrigger.addEventListener('click', () => {
      const isOpening = languageMenu.hidden
      languageMenu.hidden = !isOpening
      languageTrigger.setAttribute('aria-expanded', String(isOpening))
    })
    copyButton.addEventListener('click', () => void navigator.clipboard?.writeText(node.textContent))

    const closeMenuOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !card.contains(event.target)) closeLanguageMenu()
    }
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLanguageMenu()
    }
    document.addEventListener('pointerdown', closeMenuOnOutsidePress)
    document.addEventListener('keydown', closeMenuOnEscape)

    pre.append(contentDOM)
    header.append(label, languageTrigger, copyButton, languageMenu)
    card.append(header, pre)
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
      ignoreMutation: (mutation) => !contentDOM.contains(mutation.target),
      stopEvent: (event) => event.target instanceof Node && header.contains(event.target),
      destroy: () => {
        document.removeEventListener('pointerdown', closeMenuOnOutsidePress)
        document.removeEventListener('keydown', closeMenuOnEscape)
      },
    }
  }
}

function createImageNodeView(documentPathRef: MutableRefObject<string | null>, copyRef: MutableRefObject<EditorCopy>): NodeViewConstructor {
  return (node) => {
    const source = String(node.attrs.src ?? '')
    const alt = String(node.attrs.alt ?? '')
    if (isExternalHttpUrl(source)) return createRemoteImageView(source, alt, copyRef.current)

    // A few Markdown exporters put a .md file path in image syntax. Sending
    // it through Tauri's image asset protocol makes WebKit paint the protocol
    // error inside the document, so keep this malformed image inert.
    if (isMarkdownDocumentPath(source)) {
      const placeholder = document.createElement('span')
      placeholder.className = 'invalid-local-image'
      placeholder.textContent = alt
      return { dom: placeholder, ignoreMutation: () => true }
    }

    const image = document.createElement('img')
    image.alt = alt
    image.addEventListener('error', () => image.remove())
    image.src = documentPathRef.current && isTauri()
      ? convertFileSrc(resolveDocumentPath(documentPathRef.current, source))
      : source
    return { dom: image }
  }
}

function isMarkdownDocumentPath(source: string) {
  return /\.(?:md|markdown|mdx)(?:[?#].*)?$/i.test(source.trim())
}

function createRemoteImageView(source: string, alt: string, copy: EditorCopy) {
  const container = document.createElement('span')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'remote-image-control'
  button.textContent = copy.loadImage
  button.setAttribute('aria-label', copy.loadRemoteImage(alt))
  button.addEventListener('click', () => {
    button.disabled = true
    button.textContent = copy.loadingImage
    const image = document.createElement('img')
    image.alt = alt
    image.addEventListener('load', () => {
      container.replaceChildren(image)
    })
    image.addEventListener('error', () => {
      button.disabled = false
      button.textContent = copy.loadImageError
    })
    image.src = source
  })
  container.append(button)
  return { dom: container, ignoreMutation: () => true }
}

function resolveDocumentPath(documentPath: string, relativePath: string) {
  if (/^[\\/]/.test(relativePath)) return relativePath
  const base = documentPath.split(/[\\/]/).slice(0, -1)
  for (const segment of relativePath.split(/[\\/]/)) {
    if (!segment || segment === '.') continue
    if (segment === '..') base.pop()
    else base.push(segment)
  }
  return base.join('/')
}

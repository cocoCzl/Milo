import { defaultValueCtx, Editor, editorViewCtx, nodeViewCtx, prosePluginsCtx, rootCtx, type CmdKey } from '@milkdown/core'
import { convertFileSrc, isTauri } from '@tauri-apps/api/core'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import {
  commonmark,
} from '@milkdown/preset-commonmark'
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  autoInsertSpanPlugin,
  gfm,
} from '@milkdown/preset-gfm'
import { splitBlockAs } from '@milkdown/prose/commands'
import { NodeSelection, Plugin, TextSelection, type Command, type EditorState } from '@milkdown/prose/state'
import { CellSelection, deleteColumn, deleteRow, TableView } from '@milkdown/prose/tables'
import type { EditorView, NodeViewConstructor } from '@milkdown/prose/view'
import { callCommand } from '@milkdown/utils'
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import type { PastedImage } from '../../file-system/nativeMarkdownFile'
import type { PresentationMode } from '../../app/presentationMode'
import { isExternalHttpUrl, openExternalLink } from '../../file-system/externalLink'
import { BlockHandle } from './BlockHandle'
import { BlockMenu, type BlockMenuCopy } from './BlockMenu'
import { isValidBlockTarget, type BlockMenuCommand, type BlockTarget } from './blockControls'
import { EditorContextMenu, type EditorContextMenuCopy } from './EditorContextMenu'
import { EditorLinkPopover, type EditorLinkPopoverCopy, type LinkPopoverMode } from './EditorLinkPopover'
import { EditorOutline, type EditorHeading } from './EditorOutline'
import { ContextualEditorStore, createContextualEditorPlugin } from './contextualEditorStore'
import { createEditorCommands, isValidEditorSelectionSnapshot, splitTopLevelParagraphAtStart, type EditorCommands, type EditorSelectionSnapshot } from './editorCommands'
import { focusEditorViewPreservingSelection } from './editorFocus'
import { SelectionToolbar, type SelectionToolbarCopy } from './SelectionToolbar'
import { createSafariCompositionHardbreakPlugin, miloSafariCompositionHardbreakSchema } from './safariCompositionHardbreak'
import { miloEmptyTableCellSerializer } from './tableEmptyCellSerializer'
import { miloTableAlignmentSchema } from './tableAlignment'
import { miloPrism } from './miloPrism'

const tableDefaultCellMinWidth = 100
const createTableNodeView: NodeViewConstructor = (node) => new TableView(node, tableDefaultCellMinWidth)

type EditorMenu = {
  hasSelection: boolean
  inTable: boolean
  link: boolean
  selection: EditorSelectionSnapshot | null
  top: number
  left: number
}

type ContextMenuSelection = Pick<EditorMenu, 'hasSelection' | 'inTable' | 'link' | 'selection'>

type MilkdownEditorProps = {
  active?: boolean
  ariaLabel?: string
  copy?: Partial<EditorCopy>
  editorId?: string
  documentPath?: string | null
  initialMarkdown: string
  onMarkdownChange?: (markdown: string) => void
  onPasteImage?: (image: PastedImage) => Promise<string | null>
  placeholder?: string
  presentationMode?: PresentationMode
  outlineLayout?: 'inline' | 'drawer'
  outlineMount?: HTMLElement | null
  outlineOpen?: boolean
  contextualOverlayMount?: HTMLElement | null
  onCloseOutline?: () => void
}

type EditorCopy = BlockMenuCopy & EditorContextMenuCopy & EditorLinkPopoverCopy & SelectionToolbarCopy & {
  addColumnLeft: string
  addColumnRight: string
  addRowAbove: string
  addRowBelow: string
  codeBlockLanguage: string
  closeOutline: string
  deleteColumn: string
  deleteBlock: string
  deleteRow: string
  loadImage: string
  loadImageError: string
  loadRemoteImage: (alt: string) => string
  loadingImage: string
  noOutline: string
  outline: string
  plainText: string
  removeLink: string
  insert: string
  linkText: string
  startWritingHint: string
  startWriting: string
}

const defaultEditorCopy: EditorCopy = {
  apply: 'Apply', blockquote: 'Quote', bold: 'Bold', bulletList: 'Bulleted list', cancel: 'Cancel', codeBlock: 'Code block',
  copy: 'Copy', cut: 'Cut', divider: 'Divider', formattingToolbar: 'Formatting', heading1: 'Heading 1', heading2: 'Heading 2', heading3: 'Heading 3',
  heading4: 'Heading 4', heading5: 'Heading 5', heading6: 'Heading 6', moreHeadings: 'More Headings',
  inlineCode: 'Inline code', italic: 'Italic', link: 'Link', linkAddress: 'Link address', orderedList: 'Numbered list', paragraph: 'Body text',
  selectAll: 'Select all', strike: 'Strikethrough', table: 'Table', addBlock: 'Add block',
  addColumnLeft: 'Add column left', addColumnRight: 'Add column right', addRowAbove: 'Add row above', addRowBelow: 'Add row below',
  codeBlockLanguage: 'Code block language', closeOutline: 'Close outline', deleteColumn: 'Delete column', deleteRow: 'Delete row', loadImage: 'Load image',
  loadImageError: 'Could not load image — try again', loadRemoteImage: (alt) => `Load remote image${alt ? `: ${alt}` : ''}`,
  loadingImage: 'Loading image…', noOutline: 'Headings will appear here.', outline: 'Outline', plainText: 'Plain text', startWriting: 'Start with a thought…',
  removeLink: 'Remove link', deleteBlock: 'Delete block', insert: 'Insert', linkText: 'Link text', addLink: 'Add link', editLink: 'Edit link', insertLink: 'Insert link…',
  startWritingHint: 'Just type — Milo keeps the Markdown for you.',
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

// eslint-disable-next-line react-refresh/only-export-components -- exported to regression-test the production mouseup path.
export function syncProseMirrorSelectionFromDOM(editorView: EditorView): boolean {
  if (
    editorView.state.selection instanceof CellSelection
    || editorView.state.selection instanceof NodeSelection
  ) return true

  const domSelection = editorView.dom.ownerDocument.getSelection()

  if (
    !domSelection?.anchorNode
    || !domSelection.focusNode
    || !editorView.dom.contains(domSelection.anchorNode)
    || !editorView.dom.contains(domSelection.focusNode)
  ) return false

  try {
    const selection = TextSelection.between(
      editorView.state.doc.resolve(editorView.posAtDOM(domSelection.anchorNode, domSelection.anchorOffset)),
      editorView.state.doc.resolve(editorView.posAtDOM(domSelection.focusNode, domSelection.focusOffset)),
    )

    if (!selection.eq(editorView.state.selection)) {
      editorView.dispatch(editorView.state.tr.setSelection(selection))
    }
    return true
  } catch {
    // A browser can briefly expose a DOM selection while replacing a node.
    // A Link operation must never guess from a previous editor selection.
    return false
  }
}

// A contextmenu event is too late to trust WebKit's DOM Range: on macOS a
// secondary click over a collapsed caret can temporarily expand that Range to
// a word or block. ProseMirror has already synchronized genuine mouse
// selections through the editor's mouseup path, so the editor state is the
// authoritative context-menu selection and must be read without dispatching.
// eslint-disable-next-line react-refresh/only-export-components -- exported to regression-test the real contextmenu capture path.
export function readContextMenuSelection(editorView: EditorView): ContextMenuSelection {
  const selection = editorView.state.selection
  const snapshot: EditorSelectionSnapshot = {
    doc: editorView.state.doc,
    from: selection.from,
    to: selection.to,
    text: editorView.state.doc.textBetween(selection.from, selection.to, '\n', '\n'),
  }
  const link = selection.$from.marks().some((mark) => mark.type.name === 'link')
  let inTable = false
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    if (selection.$from.node(depth).type.name === 'table') {
      inTable = true
      break
    }
  }
  return { hasSelection: !selection.empty, inTable, link, selection: snapshot }
}

function linkHrefAtSelection(selection: EditorSelectionSnapshot): string | null {
  const link = selection.doc.type.schema.marks.link
  if (!link) return null
  let href: string | null = null
  selection.doc.nodesBetween(selection.from, selection.to, (node) => {
    const mark = link.isInSet(node.marks)
    if (mark && typeof mark.attrs.href === 'string' && href === null) href = mark.attrs.href
  })
  return href
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

  // ProseMirror's split command inherits the heading's textblock context at
  // its start.  Typora-style Enter at offset zero instead inserts a normal
  // paragraph *before* the heading, leaving the heading node and its content
  // untouched.
  if (selection.from === selection.$from.start(selection.$from.depth)) {
    const transaction = state.tr.insert(headingStart, paragraph.create())
    dispatch?.(transaction.setSelection(TextSelection.create(transaction.doc, headingStart + 1)).scrollIntoView())
    return true
  }

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

const exitCodeOrTableAsParagraph: Command = (state, dispatch) => {
  const { $from } = state.selection
  let blockDepth: number | null = null

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth).type.name
    if (nodeName === 'code_block' || nodeName === 'table') {
      blockDepth = depth
      break
    }
  }

  const paragraph = state.schema.nodes.paragraph
  if (blockDepth === null || !paragraph) return false

  const insertPosition = $from.after(blockDepth)
  const transaction = state.tr.insert(insertPosition, paragraph.create())
  dispatch?.(
    transaction
      .setSelection(TextSelection.create(transaction.doc, insertPosition + 1))
      .scrollIntoView(),
  )
  return true
}

const headingScrollOffset = 24
// WebKit may report a fractional residual after a scroll is clamped at the
// end of a long document.  Treat the final few pixels as the bottom so the
// last visible heading, rather than its predecessor, wins the active state.
const scrollBottomTolerance = 8
const headingActivationTolerance = 2

type PendingHeadingNavigation = {
  pos: number
}

function headingScrollTop(stage: HTMLElement, heading: HTMLElement): number {
  const stageRect = stage.getBoundingClientRect()
  const headingRect = heading.getBoundingClientRect()
  const maxScrollTop = Math.max(0, stage.scrollHeight - stage.clientHeight)
  const targetTop = stage.scrollTop + headingRect.top - stageRect.top - headingScrollOffset
  return Math.min(maxScrollTop, Math.max(0, targetTop))
}

type HeadingDomCache = {
  doc: EditorState['doc']
  elementsById: ReadonlyMap<string, HTMLElement>
}

// Milkdown's built-in heading-id plugin assigns a unique `id` to every
// non-empty heading.  Unlike `nodeDOM(position)`, that id survives the
// ProseMirror block-boundary ambiguity seen in WKWebView.  It is also more
// reliable than pairing heading nodes and DOM elements by their list indexes:
// an editor extension may add a heading-like DOM node without changing the
// document model.  Navigation therefore resolves the active editor's current
// heading through the same unique id used in the outline model.
const headingDomCaches = new WeakMap<EditorView, HeadingDomCache>()

function headingElementsById(editorView: EditorView): ReadonlyMap<string, HTMLElement> {
  const cached = headingDomCaches.get(editorView)
  if (
    cached?.doc === editorView.state.doc
    && Array.from(cached.elementsById.values()).every((element) => editorView.dom.contains(element))
  ) return cached.elementsById

  const elementsById = new Map<string, HTMLElement>()
  editorView.dom.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]').forEach((element) => {
    if (element.id && !elementsById.has(element.id)) elementsById.set(element.id, element)
  })

  headingDomCaches.set(editorView, { doc: editorView.state.doc, elementsById })
  return elementsById
}

function headingElement(editorView: EditorView, heading: EditorHeading): HTMLElement | null {
  const node = editorView.state.doc.nodeAt(heading.pos)
  if (
    node?.type.name !== 'heading'
    || node.textContent.trim() !== heading.text
    || Number(node.attrs.level) !== heading.level
    || node.attrs.id !== heading.id
  ) {
    return null
  }

  const element = headingElementsById(editorView).get(heading.id)
  if (!element) return null
  if (element.tagName.toLowerCase() !== `h${heading.level}` || element.textContent?.trim() !== heading.text) {
    return null
  }
  return element
}

function headingAtSelection(state: EditorState, headingsByPosition: ReadonlyMap<number, EditorHeading>): number | null {
  for (let depth = state.selection.$from.depth; depth > 0; depth -= 1) {
    if (state.selection.$from.node(depth).type.name !== 'heading') continue
    const position = state.selection.$from.before(depth)
    return headingsByPosition.has(position) ? position : null
  }
  return null
}

function activeHeadingFromScroll(
  headings: EditorHeading[],
  getElement: (pos: number) => HTMLElement | null,
  stage: HTMLElement,
): number | null {
  if (headings.length === 0) return null

  const stageRect = stage.getBoundingClientRect()
  const remainingScroll = Math.max(0, stage.scrollHeight - stage.clientHeight - stage.scrollTop)
  // The final document padding and WebKit fractional layout mean strict
  // equality with maxScrollTop is not dependable.  Once the remaining travel
  // is visually negligible, use the last heading actually intersecting the
  // article viewport so the final chapters can become active.
  const bottomThreshold = Math.max(scrollBottomTolerance, Math.min(48, stage.clientHeight * 0.08))
  const isAtBottom = remainingScroll <= bottomThreshold
  const activationLine = stageRect.top + headingScrollOffset + headingActivationTolerance
  let current = headings[0].pos
  let lastVisible: number | null = null

  for (const heading of headings) {
    const element = getElement(heading.pos)
    if (!element) continue
    const rect = element.getBoundingClientRect()
    if (rect.bottom > stageRect.top && rect.top < stageRect.bottom) lastVisible = heading.pos
    if (!isAtBottom && rect.top <= activationLine) current = heading.pos
  }

  return isAtBottom ? lastVisible ?? headings[headings.length - 1].pos : current
}

export function MilkdownEditor({
  active = true,
  ariaLabel = 'Untitled Markdown document',
  copy,
  editorId = 'standalone-editor',
  documentPath = null,
  initialMarkdown,
  onMarkdownChange,
  onPasteImage,
  placeholder,
  presentationMode = 'edit',
  outlineLayout = 'inline',
  outlineMount = null,
  outlineOpen = false,
  contextualOverlayMount = null,
  onCloseOutline,
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
  const presentationModeRef = useRef<PresentationMode>(presentationMode)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<EditorMenu | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [headings, setHeadings] = useState<EditorHeading[]>([])
  const [linkEditorOpen, setLinkEditorOpen] = useState(false)
  const [linkMode, setLinkMode] = useState<LinkPopoverMode>('create-from-selection')
  const [linkCanRemove, setLinkCanRemove] = useState(false)
  const [linkText, setLinkText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkSelection, setLinkSelection] = useState<EditorSelectionSnapshot | null>(null)
  const [linkAnchor, setLinkAnchor] = useState<{ left: number; top: number } | null>(null)
  const [blockMenuTarget, setBlockMenuTarget] = useState<BlockTarget | null>(null)
  const [activeHeadingPosition, setActiveHeadingPosition] = useState<number | null>(null)
  const headingsByPositionRef = useRef(new Map<number, EditorHeading>())
  const pendingNavigationRef = useRef<PendingHeadingNavigation | null>(null)
  const contextualStoreRef = useRef<ContextualEditorStore | null>(null)
  // A modifier-click link navigation must never enter ProseMirror's normal
  // pointer selection lifecycle.  Keep this per-editor (rather than in the
  // app store) because it only describes one in-flight pointer sequence.
  const linkNavigationPointerRef = useRef(false)
  const dismissedSelectionRef = useRef<string | null>(null)
  if (!contextualStoreRef.current) contextualStoreRef.current = new ContextualEditorStore()

  onMarkdownChangeRef.current = onMarkdownChange
  onPasteImageRef.current = onPasteImage
  presentationModeRef.current = presentationMode
  ariaLabelRef.current = ariaLabel
  copyRef.current = editorCopy
  documentPathRef.current = documentPath

  headingsByPositionRef.current = new Map(headings.map((heading) => [heading.pos, heading]))

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
          createContextualEditorPlugin(contextualStoreRef.current!),
          createSafariCompositionHardbreakPlugin(),
          new Plugin({
            props: {
              handleKeyDown: (editorView, event) => {
                if (
                  event.key === 'Enter'
                  && (event.metaKey || event.ctrlKey)
                  && !event.shiftKey
                  && !event.altKey
                  && !editorView.composing
                ) {
                  syncProseMirrorSelectionFromDOM(editorView)
                  const handled = exitCodeOrTableAsParagraph(editorView.state, editorView.dispatch)
                  if (handled) editorView.focus()
                  return handled
                }

                if (
                  event.key !== 'Enter'
                  || event.shiftKey
                  || event.altKey
                  || event.ctrlKey
                  || event.metaKey
                  || editorView.composing
                ) return false

                syncProseMirrorSelectionFromDOM(editorView)
                return splitTopLevelParagraphAtStart(editorView.state, editorView.dispatch)
                  || exitHeadingAsParagraph(editorView.state, editorView.dispatch)
              },
            },
          }),
          ...plugins,
        ])
        ctx.update(nodeViewCtx, (views) => [
          ...views,
          ['table', createTableNodeView] as [string, NodeViewConstructor],
          ['code_block', createCodeBlockNodeView(copyRef, presentationModeRef)] as [string, NodeViewConstructor],
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
            if (!disposed && currentView.state) {
              if (!currentView.state.selection.empty) setBlockMenuTarget(null)
              // Selection is only a secondary signal.  It closes the small
              // click-to-scroll race in edit mode; scrolling itself remains
              // the source of truth whenever the user moves the document.
              const selectedHeading = headingAtSelection(currentView.state, headingsByPositionRef.current)
              if (selectedHeading !== null) setActiveHeadingPosition(selectedHeading)
            }
          })
          setContextMenu(null)
        })
      })
      .use(commonmark)
      .use(miloSafariCompositionHardbreakSchema)
      // Milkdown's GFM preset registers a Safari table-cell IME workaround
      // globally. Its widget contaminates ordinary paragraph composition in
      // WKWebView, so retain every other GFM component by identity and omit
      // only that plugin.
      .use(gfm.filter((plugin) => plugin !== autoInsertSpanPlugin))
      .use(miloTableAlignmentSchema)
      .use(miloEmptyTableCellSerializer)
      .use(miloPrism)
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
        setHeadings(readHeadings(editorState))
      })
      setIsReady(true)
    })

    return () => {
      disposed = true
      contextualStoreRef.current?.clear()
      editorRef.current = null
      void editor.destroy()
    }
  }, [])

  useEffect(() => {
    editorRootRef.current?.querySelector<HTMLElement>('.ProseMirror')?.setAttribute('aria-label', ariaLabel)
  }, [ariaLabel])

  useEffect(() => {
    if (!isReady) return

    editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      editorView.setProps({ ...editorView.props, editable: () => presentationModeRef.current === 'edit' })
      editorView.dom.setAttribute('aria-readonly', String(presentationMode === 'read'))
    })
    editorRootRef.current?.querySelectorAll<HTMLButtonElement>('.code-block-card__language-trigger').forEach((trigger) => {
      trigger.disabled = presentationMode === 'read'
    })
    if (presentationMode === 'read') {
      editorRootRef.current?.querySelectorAll<HTMLElement>('.code-block-card__language-menu').forEach((menu) => { menu.hidden = true })
      setContextMenu(null)
      setLinkEditorOpen(false)
      setLinkCanRemove(false)
      setLinkSelection(null)
      setLinkAnchor(null)
    }
  }, [isReady, presentationMode])

  useEffect(() => {
    if (!contextMenu) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target)) setContextMenu(null)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
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
    if (presentationModeRef.current !== 'edit') return
    const image = Array.from(event.clipboardData.files ?? []).find((file) => file.type.startsWith('image/'))
    if (!image || !onPasteImageRef.current) return
    event.preventDefault()
    void image.arrayBuffer().then((buffer) => onPasteImageRef.current?.({
      bytes: Array.from(new Uint8Array(buffer)),
      mimeType: image.type,
    })).then((relativePath) => {
      if (relativePath) insertImage(relativePath)
    })
  }, [insertImage])

  const linkNavigationTarget = useCallback((event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const link = target.closest<HTMLAnchorElement>('a[href]')
    const url = link?.getAttribute('href')
    if (!url || !isExternalHttpUrl(url)) return null
    return url
  }, [])

  const suppressModifierLinkPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (presentationModeRef.current !== 'edit' || event.button !== 0 || (!event.metaKey && !event.ctrlKey)) return
    const url = linkNavigationTarget(event)
    if (!url) return
    // This runs before ProseMirror's pointer handler.  Preventing the native
    // default stops WebKit from selecting the anchor text; stopping propagation
    // keeps ProseMirror from publishing a transient non-empty selection that
    // would otherwise flash the SelectionToolbar.
    linkNavigationPointerRef.current = true
    event.preventDefault()
    event.stopPropagation()
    dismissedSelectionRef.current = null
  }, [linkNavigationTarget])

  const openLinkOnCommandClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const url = linkNavigationTarget(event)
    if (!url) return
    const shouldOpen = presentationModeRef.current === 'read' || event.metaKey || event.ctrlKey || linkNavigationPointerRef.current
    if (!shouldOpen) return
    event.preventDefault()
    event.stopPropagation()
    linkNavigationPointerRef.current = false
    void openExternalLink(url).catch(() => undefined)
  }, [linkNavigationTarget])

  const focusEditor = useCallback(() => {
    editorRootRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus()
  }, [])

  const focusEditorView = useCallback(() => {
    editorRef.current?.action((ctx) => focusEditorViewPreservingSelection(ctx.get(editorViewCtx)))
  }, [])

  const dismissContextMenu = useCallback(() => {
    setContextMenu(null)
    // EditorView#focus restores the existing ProseMirror selection without
    // dispatching a transaction or coercing CellSelection/NodeSelection to a
    // TextSelection.
    focusEditorView()
  }, [focusEditorView])

  const syncEditorSelectionFromDOM = useCallback(() => editorRef.current?.action((ctx) => {
    const editorView = ctx.get(editorViewCtx)
    syncProseMirrorSelectionFromDOM(editorView)
  }), [])

  // WebKit can defer ProseMirror's DOM-selection synchronization until after
  // a React portal interaction. Capture the native selection synchronously at
  // the Link boundary instead of trusting a previously rendered overlay state.
  const captureEditorSelection = useCallback((allowCollapsed = false): EditorSelectionSnapshot | null => (
    editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      if (!syncProseMirrorSelectionFromDOM(editorView)) return null
      const { from, to } = editorView.state.selection
      if (from === to && !allowCollapsed) return null
      return {
        doc: editorView.state.doc,
        from,
        to,
        text: editorView.state.doc.textBetween(from, to, '\n', '\n'),
      }
    }) ?? null
  ), [])

  const headingElementForPosition = useCallback((pos: number): HTMLElement | null => (
    editorRef.current?.action((ctx) => {
      const heading = headingsByPositionRef.current.get(pos)
      return heading ? headingElement(ctx.get(editorViewCtx), heading) : null
    }) ?? null
  ), [])

  const navigateToHeading = useCallback((requestedHeading: EditorHeading): boolean => {
    if (!active) return false
    // A portal can outlive a document refresh for one React commit.  Resolve
    // the click through the current editor's position map, never an array
    // index, and refuse a stale heading identity rather than navigating a
    // different chapter.
    const heading = headingsByPositionRef.current.get(requestedHeading.pos)
    if (!heading || heading.key !== requestedHeading.key) return false

    const navigated = editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      const headingNode = headingElement(editorView, heading)
      const stage = editorRootRef.current?.closest<HTMLElement>('.document-stage')
      if (!headingNode) return false

      // Measure against the real document scroll root. Outline navigation is
      // intentionally scroll-only in both presentation modes. Moving the
      // editable selection here makes WKWebView reveal its caret afterwards,
      // which can overwrite the target position (most visibly near a long
      // document's final headings). A click in the outline is navigation, not
      // an edit operation.
      let targetTop: number | null = null
      if (stage) {
        targetTop = headingScrollTop(stage, headingNode)
        // Register the target before mutating the scroll container. Near the
        // document bottom several final headings can be visible at the same
        // time, while `maxScrollTop` prevents the requested heading from
        // reaching the activation line. The explicit outline choice remains
        // authoritative until the user deliberately scrolls again.
        pendingNavigationRef.current = { pos: heading.pos }
      } else if (typeof headingNode.scrollIntoView === 'function') {
        pendingNavigationRef.current = null
      }

      if (stage && targetTop !== null) {
        // Element#scrollTo with an options dictionary intermittently no-ops
        // in the current macOS WKWebView after an outline button has taken
        // focus.  The scrollTop property targets the same real scroll root
        // and is synchronous, which makes the destination deterministic.
        stage.scrollTop = targetTop
      } else if (typeof headingNode.scrollIntoView === 'function') {
        headingNode.scrollIntoView({ block: 'start', behavior: 'auto' })
      }
      return true
    }) ?? false

    if (navigated) {
      // Do not release this simply after a paint frame: a clamped bottom
      // navigation can never make an earlier final heading win a pure
      // viewport-based calculation. Input listeners below release it on the
      // next intentional user navigation.
      setActiveHeadingPosition(heading.pos)
    }
    return navigated
  }, [active])

  useEffect(() => {
    if (!active || !isReady) return
    const stage = editorRootRef.current?.closest<HTMLElement>('.document-stage')
    if (!stage) return
    let frame = 0
    const updateActiveHeading = () => {
      frame = 0
      const pending = pendingNavigationRef.current

      if (pending) {
        setActiveHeadingPosition((previous) => previous === pending.pos ? previous : pending.pos)
        return
      }

      const current = activeHeadingFromScroll(headings, headingElementForPosition, stage)
      setActiveHeadingPosition((previous) => previous === current ? previous : current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(updateActiveHeading) }
    const cancelPendingNavigation = () => { pendingNavigationRef.current = null }
    updateActiveHeading()
    stage.addEventListener('scroll', onScroll, { passive: true })
    stage.addEventListener('wheel', cancelPendingNavigation, { passive: true })
    stage.addEventListener('touchstart', cancelPendingNavigation, { passive: true })
    stage.addEventListener('pointerdown', cancelPendingNavigation, { passive: true })
    stage.addEventListener('keydown', cancelPendingNavigation)
    return () => {
      stage.removeEventListener('scroll', onScroll)
      stage.removeEventListener('wheel', cancelPendingNavigation)
      stage.removeEventListener('touchstart', cancelPendingNavigation)
      stage.removeEventListener('pointerdown', cancelPendingNavigation)
      stage.removeEventListener('keydown', cancelPendingNavigation)
      // This editor can remain mounted while its document panel is hidden.
      // Its click lock is meaningful only for the currently visible tab; do
      // not let a previous tab's bottom-navigation choice survive a switch.
      pendingNavigationRef.current = null
      if (frame) cancelAnimationFrame(frame)
    }
  }, [active, headingElementForPosition, headings, isReady])

  const restoreSelection = useCallback((editorView: EditorView, selection?: EditorSelectionSnapshot) => {
    if (!selection) return true
    if (!isValidEditorSelectionSnapshot(editorView.state, selection)) return false
    editorView.dispatch(editorView.state.tr.setSelection(TextSelection.create(editorView.state.doc, selection.from, selection.to)))
    return true
  }, [])

  const runEditorCommand = useCallback(<T,>(command: CmdKey<T>, payload?: T, selection?: EditorSelectionSnapshot) => {
    const editor = editorRef.current
    if (!editor) return false
    let accepted = true
    if (selection) {
      accepted = editor.action((ctx) => restoreSelection(ctx.get(editorViewCtx), selection))
    } else {
      syncEditorSelectionFromDOM()
    }
    if (!accepted) return false
    const applied = editor.action(callCommand(command, payload))
    if (!applied) return false
    focusEditor()
    return true
  }, [focusEditor, restoreSelection, syncEditorSelectionFromDOM])

  const runProseCommand = useCallback((command: Command, selection?: EditorSelectionSnapshot) => {
    const editor = editorRef.current
    if (!editor) return false
    const applied = editor.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      if (!restoreSelection(editorView, selection)) return false
      if (!selection) syncProseMirrorSelectionFromDOM(editorView)
      return command(editorView.state, editorView.dispatch)
    })
    if (!applied) return false
    focusEditor()
    return true
  }, [focusEditor, restoreSelection])

  const editorCommands: EditorCommands = useMemo(() => createEditorCommands({
    runMilkdown: runEditorCommand,
    runProse: runProseCommand,
    readState: () => editorRef.current?.action((ctx) => ctx.get(editorViewCtx).state) ?? null,
  }), [runEditorCommand, runProseCommand])

  const pasteLink = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    if (presentationModeRef.current !== 'edit') return
    const href = event.clipboardData.getData('text/plain').trim()
    if (!isExternalHttpUrl(href)) return
    const selection = captureEditorSelection(true)
    if (!selection) return
    const applied = selection.from === selection.to
      ? editorCommands.insertLink(href, href, selection)
      : editorCommands.applyLinkToSelection(href, selection)
    if (applied) event.preventDefault()
  }, [captureEditorSelection, editorCommands])

  const openLinkEditor = useCallback((mode: LinkPopoverMode, selection: EditorSelectionSnapshot | null, href = '', anchor: { left: number; top: number } | null = null) => {
    const view = contextualStoreRef.current?.getSnapshot().view
    let resolvedAnchor = anchor
    if (!resolvedAnchor && view && selection) {
      try {
        const start = view.coordsAtPos(selection.from)
        const end = view.coordsAtPos(selection.to)
        resolvedAnchor = { left: (start.left + end.right) / 2, top: Math.min(start.top, end.top) }
      } catch {
        resolvedAnchor = null
      }
    }
    setLinkSelection(selection)
    setLinkMode(mode)
    setLinkCanRemove(Boolean(href))
    setLinkText(mode === 'insert' ? '' : selection?.text ?? '')
    setLinkUrl(href)
    setLinkAnchor(resolvedAnchor)
    setBlockMenuTarget(null)
    setLinkEditorOpen(true)
  }, [])

  const openLinkEditorForSelection = useCallback((selection: EditorSelectionSnapshot, anchor: { left: number; top: number } | null = null) => {
    if (selection.from === selection.to) {
      openLinkEditor('insert', selection, '', anchor)
      return
    }
    const href = linkHrefAtSelection(selection)
    openLinkEditor(href ? 'edit' : 'create-from-selection', selection, href ?? '', anchor)
  }, [openLinkEditor])

  const openSelectionLinkEditor = useCallback((anchor: { left: number; top: number } | null = null) => {
    const selection = captureEditorSelection()
    if (!selection) return
    openLinkEditorForSelection(selection, anchor)
  }, [captureEditorSelection, openLinkEditorForSelection])

  const openInsertLinkEditor = useCallback((anchor: { left: number; top: number } | null = null) => {
    const selection = captureEditorSelection(true)
    if (!selection || selection.from !== selection.to) return
    openLinkEditorForSelection(selection, anchor)
  }, [captureEditorSelection, openLinkEditorForSelection])

  useEffect(() => {
    if (!active || presentationMode !== 'edit') return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return
      const selection = captureEditorSelection(true)
      if (!selection) return
      event.preventDefault()
      if (selection.from === selection.to) openInsertLinkEditor()
      else openSelectionLinkEditor()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, captureEditorSelection, openInsertLinkEditor, openSelectionLinkEditor, presentationMode])

  const cancelLinkEditor = useCallback(() => {
    setLinkEditorOpen(false)
    setLinkCanRemove(false)
    setLinkSelection(null)
    setLinkAnchor(null)
    setLinkText('')
  }, [])

  const applyLink = useCallback(() => {
    const href = linkUrl.trim()
    if (!href) return
    const text = linkText.trim() || href
    const applied = linkMode === 'insert'
      ? editorCommands.insertLink(text, href, linkSelection ?? undefined)
      : linkMode === 'edit'
        ? editorCommands.updateLink(href, linkSelection ?? undefined)
        : editorCommands.applyLinkToSelection(href, linkSelection ?? undefined)
    if (!applied) {
      cancelLinkEditor()
      return
    }
    setLinkEditorOpen(false)
    setLinkCanRemove(false)
    setLinkSelection(null)
    setLinkAnchor(null)
  }, [cancelLinkEditor, editorCommands, linkMode, linkSelection, linkText, linkUrl])

  const removeLink = useCallback(() => {
    if (!editorCommands.removeLink(linkSelection ?? undefined)) {
      cancelLinkEditor()
      return
    }
    setLinkEditorOpen(false)
    setLinkCanRemove(false)
    setLinkSelection(null)
    setLinkAnchor(null)
  }, [cancelLinkEditor, editorCommands, linkSelection])

  const containsContextualInteraction = useCallback((target: EventTarget | null) => (
    target instanceof Node
    && (editorRootRef.current?.contains(target) || contextualOverlayMount?.contains(target) || false)
  ), [contextualOverlayMount])

  const closeBlockMenu = useCallback(() => setBlockMenuTarget(null), [])

  const runBlockMenuCommand = useCallback((command: BlockMenuCommand, target: BlockTarget) => {
    const valid = active && presentationModeRef.current === 'edit' && editorRef.current?.action((ctx) => {
      const state = ctx.get(editorViewCtx).state
      return isValidBlockTarget(state, editorId, target)
    })
    if (!valid) {
      closeBlockMenu()
      return
    }

    switch (command) {
      case 'paragraph': editorCommands.setParagraph(target.selection); break
      case 'heading-1': editorCommands.setHeading1(target.selection); break
      case 'heading-2': editorCommands.setHeading2(target.selection); break
      case 'heading-3': editorCommands.setHeading3(target.selection); break
      case 'heading-4': editorCommands.setHeading4(target.selection); break
      case 'heading-5': editorCommands.setHeading5(target.selection); break
      case 'heading-6': editorCommands.setHeading6(target.selection); break
      case 'blockquote': editorCommands.setQuote(target.selection); break
      case 'bullet-list': editorCommands.toggleBulletList(target.selection); break
      case 'ordered-list': editorCommands.toggleOrderedList(target.selection); break
      case 'code-block': editorCommands.setCodeBlock(target.selection); break
      case 'table': editorCommands.insertTable(target.selection); break
      case 'divider': {
        if (editorCommands.insertDivider(target)) focusEditorView()
        break
      }
      case 'delete-block': editorCommands.deleteBlock(target); break
    }
    closeBlockMenu()
  }, [active, closeBlockMenu, editorCommands, editorId, focusEditorView])

  useEffect(() => {
    if (!active || presentationMode !== 'edit' || linkEditorOpen) closeBlockMenu()
  }, [active, closeBlockMenu, linkEditorOpen, presentationMode])

  useEffect(() => {
    if (!linkEditorOpen) return undefined
    const stage = editorRootRef.current?.closest<HTMLElement>('.document-stage')
    stage?.addEventListener('scroll', cancelLinkEditor, { passive: true })
    return () => stage?.removeEventListener('scroll', cancelLinkEditor)
  }, [cancelLinkEditor, linkEditorOpen])

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
    if (presentationModeRef.current !== 'edit') return
    const target = event.target
    const editor = editorRef.current
    if (!editor || !(target instanceof Element) || !target.closest('.ProseMirror')) return

    // Menu focus moves outside the editor. Read the already-synchronized PM
    // selection without importing WebKit's transient secondary-click Range.
    event.preventDefault()
    const menuState = editor.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      const nextMenu = readContextMenuSelection(editorView)
      // WebKit may paint a transient word/block Range before delivering the
      // contextmenu event. Reassert the unchanged PM selection synchronously;
      // the menu receives focus in its layout effect immediately afterward.
      focusEditorViewPreservingSelection(editorView)
      return nextMenu
    })
    setContextMenu({
      ...menuState,
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - (menuState.inTable ? 420 : 250))),
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)),
    })
  }, [])

  const runContextCommand = useCallback((command: 'cut' | 'copy' | 'select-all' | 'bold' | 'italic' | 'link') => {
    const selection = contextMenu?.selection
    const anchor = contextMenu ? { left: contextMenu.left, top: contextMenu.top } : null
    setContextMenu(null)
    if (command === 'bold') return editorCommands.toggleBold(selection ?? undefined)
    if (command === 'italic') return editorCommands.toggleItalic(selection ?? undefined)
    if (command === 'link') {
      if (selection) openLinkEditorForSelection(selection, anchor)
      return
    }
    focusEditor()
    if (command === 'select-all') {
      document.execCommand('selectAll')
      return
    }
    if (command === 'cut' || command === 'copy') {
      document.execCommand(command)
    }
  }, [contextMenu, editorCommands, focusEditor, openLinkEditorForSelection])

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
    if (presentationModeRef.current !== 'edit') return
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
      className={`milkdown-editor${presentationMode === 'read' ? ' milkdown-editor--read' : ''}`}
      onPointerDownCapture={suppressModifierLinkPointer}
      onClickCapture={openLinkOnCommandClick}
      onClick={toggleTaskItem}
      onContextMenu={openEditorMenu}
      onKeyUpCapture={syncEditorSelectionFromDOM}
      onMouseUpCapture={syncEditorSelectionFromDOM}
      onPasteCapture={(event) => {
        pasteLink(event)
        if (!event.defaultPrevented) pasteImage(event)
      }}
    >
      {contextualOverlayMount && active && presentationMode === 'edit' ? createPortal(
        <>
          <SelectionToolbar
            active={active}
            containsInteractionTarget={containsContextualInteraction}
            copy={editorCopy}
            dismissedSelectionRef={dismissedSelectionRef}
            interactionOpen={linkEditorOpen || Boolean(blockMenuTarget)}
            store={contextualStoreRef.current!}
            onCommand={(command) => {
              if (command === 'bold') editorCommands.toggleBold()
              if (command === 'italic') editorCommands.toggleItalic()
              if (command === 'strike') editorCommands.toggleStrike()
              if (command === 'inline-code') editorCommands.toggleInlineCode()
            }}
            onLink={openSelectionLinkEditor}
          />
          <BlockHandle
            active={active}
            editorId={editorId}
            interactionOpen={linkEditorOpen}
            label={editorCopy.addBlock}
            menuTarget={blockMenuTarget}
            store={contextualStoreRef.current!}
            onOpenMenu={setBlockMenuTarget}
          />
          {blockMenuTarget ? (
            <BlockMenu
              copy={editorCopy}
              target={blockMenuTarget}
              onClose={closeBlockMenu}
              onCommand={runBlockMenuCommand}
            />
          ) : null}
          {linkEditorOpen && linkSelection ? (
            <EditorLinkPopover
              canRemove={linkCanRemove}
              copy={editorCopy}
              href={linkUrl}
              hrefValid={isExternalHttpUrl(linkUrl.trim())}
              mode={linkMode}
              position={linkAnchor}
              selection={linkSelection}
              text={linkText}
              onApply={applyLink}
              onCancel={cancelLinkEditor}
              onHrefChange={setLinkUrl}
              onRemove={removeLink}
              onTextChange={setLinkText}
            />
          ) : null}
        </>,
        contextualOverlayMount,
      ) : null}
      {outlineMount && (outlineLayout === 'inline' || outlineOpen) ? createPortal(
        <>
          {outlineOpen && outlineLayout === 'drawer' ? <div aria-hidden="true" className="outline-backdrop" onMouseDown={onCloseOutline} /> : null}
          <EditorOutline
            activePosition={activeHeadingPosition}
            closeLabel={editorCopy.closeOutline}
            drawer={outlineLayout === 'drawer'}
            emptyLabel={editorCopy.noOutline}
            headings={headings}
            label={editorCopy.outline}
            onClose={onCloseOutline}
            onSelect={(heading) => {
              if (navigateToHeading(heading) && outlineLayout === 'drawer') onCloseOutline?.()
            }}
          />
        </>,
        outlineMount,
      ) : null}
      <span aria-hidden="true" className="milkdown-editor__empty-state">
        <span className="milkdown-editor__placeholder">{placeholder ?? editorCopy.startWriting}</span>
        <span className="milkdown-editor__hint">{editorCopy.startWritingHint}</span>
      </span>
      {presentationMode === 'edit' && contextMenu ? (
        <EditorContextMenu
          ref={contextMenuRef}
          copy={editorCopy}
          hasSelection={contextMenu.hasSelection}
          inTable={contextMenu.inTable}
          linkLabel={contextMenu.link ? editorCopy.editLink : contextMenu.hasSelection ? editorCopy.addLink : editorCopy.insertLink}
          position={{ left: contextMenu.left, top: contextMenu.top }}
          onCommand={runContextCommand}
          onDismiss={dismissContextMenu}
          onTableCommand={runContextTableCommand}
        />
      ) : null}
    </div>
  )
}

function readHeadings(state: EditorState): EditorHeading[] {
  const headings: EditorHeading[] = []

  state.doc.descendants((node, position) => {
    if (node.type.name !== 'heading') return
    const text = node.textContent.trim()
    const id = typeof node.attrs.id === 'string' ? node.attrs.id : ''
    // The Milkdown heading-id plugin fills this during editor initialization.
    // If it has not completed yet, do not expose a navigable heading that
    // could resolve to a different DOM node; the next document update supplies
    // the stable id and publishes it to the outline.
    if (text && id) headings.push({ id, key: id, level: Number(node.attrs.level) || 1, pos: position, text })
  })

  return headings
}

function createCodeBlockNodeView(
  copyRef: MutableRefObject<EditorCopy>,
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
      const selectedOption = languageOptions.find((option) => option.value === selected) ?? languageOptions[0]
      const selectedLabel = selectedOption.value ? selectedOption.label : copyRef.current.plainText
      card.dataset.language = selected
      label.textContent = copyRef.current.codeBlock
      languageTrigger.textContent = selectedLabel
      languageTrigger.setAttribute('aria-label', `${copyRef.current.codeBlockLanguage}: ${selectedLabel}`)
      languageTrigger.disabled = presentationModeRef.current !== 'edit'
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
        if (presentationModeRef.current !== 'edit') return
        const position = getPos()
        if (typeof position === 'number') {
          editorView.dispatch(editorView.state.tr.setNodeAttribute(position, 'language', option.value))
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
    copyButton.addEventListener('click', () => void navigator.clipboard?.writeText(node.textContent))

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

// eslint-disable-next-line react-refresh/only-export-components -- exported to regression-test the NodeView lifecycle directly.
export function createImageNodeView(documentPathRef: MutableRefObject<string | null>, copyRef: MutableRefObject<EditorCopy>): NodeViewConstructor {
  return (node) => {
    const source = String(node.attrs.src ?? '')
    const alt = String(node.attrs.alt ?? '')
    if (isExternalHttpUrl(source)) return createRemoteImageView(node, copyRef.current)

    // A few Markdown exporters put a .md file path in image syntax. Sending
    // it through Tauri's image asset protocol makes WebKit paint the protocol
    // error inside the document, so keep this malformed image inert.
    if (isMarkdownDocumentPath(source)) {
      const placeholder = document.createElement('span')
      placeholder.className = 'invalid-local-image'
      placeholder.textContent = alt
      return { dom: placeholder, ignoreMutation: () => true }
    }

    const root = document.createElement('span')
    root.className = 'local-image-view'
    root.setAttribute('contenteditable', 'false')
    let currentNode = node
    let currentImage: HTMLImageElement | null = null
    let generation = 0

    const clearCurrentImage = () => {
      if (!currentImage) return
      currentImage.onload = null
      currentImage.onerror = null
      currentImage = null
    }

    const failureLabel = () => copyRef.current.loadImageError
      .replace(/\s*[—–-]\s*.*$/, '')
      .replace(/[，,]\s*.*$/, '')
      .trim() || copyRef.current.loadImageError

    const showPlaceholder = (state: 'empty' | 'error', imageAlt: string, token: number) => {
      if (token !== generation) return
      clearCurrentImage()
      root.dataset.imageState = state
      const placeholder = document.createElement('span')
      placeholder.className = 'local-image-placeholder'
      placeholder.dataset.imageState = state
      placeholder.setAttribute('contenteditable', 'false')
      if (imageAlt) {
        const description = document.createElement('span')
        description.className = 'local-image-placeholder__alt'
        description.textContent = imageAlt
        placeholder.append(description)
      }
      const status = document.createElement('span')
      status.className = 'local-image-placeholder__status'
      status.textContent = failureLabel()
      placeholder.append(status)
      placeholder.setAttribute('aria-label', imageAlt ? `${imageAlt}. ${status.textContent}` : status.textContent)
      root.replaceChildren(placeholder)
    }

    const render = () => {
      generation += 1
      const token = generation
      clearCurrentImage()
      const nextSource = String(currentNode.attrs.src ?? '')
      const nextAlt = String(currentNode.attrs.alt ?? '')
      const nextTitle = String(currentNode.attrs.title ?? '')
      if (!nextSource) {
        showPlaceholder('empty', nextAlt, token)
        return
      }

      root.dataset.imageState = 'loading'
      const image = document.createElement('img')
      currentImage = image
      image.alt = nextAlt
      if (nextTitle) image.title = nextTitle
      image.onload = () => {
        if (token !== generation || currentImage !== image) return
        root.dataset.imageState = 'loaded'
      }
      image.onerror = () => {
        if (token !== generation || currentImage !== image) return
        showPlaceholder('error', nextAlt, token)
      }
      root.replaceChildren(image)
      image.src = documentPathRef.current && isTauri()
        ? convertFileSrc(resolveDocumentPath(documentPathRef.current, nextSource))
        : nextSource
    }

    render()
    return {
      dom: root,
      update: (nextNode) => {
        if (
          nextNode.type !== currentNode.type
          || isExternalHttpUrl(String(nextNode.attrs.src ?? ''))
          || isMarkdownDocumentPath(String(nextNode.attrs.src ?? ''))
        ) return false
        currentNode = nextNode
        render()
        return true
      },
      // This atom has no contentDOM. Only mutations within its stable, inert
      // rendering chrome are ignored; mutations outside the NodeView still
      // reach ProseMirror normally.
      ignoreMutation: (mutation) => mutation.target === root || root.contains(mutation.target),
      destroy: () => {
        generation += 1
        clearCurrentImage()
      },
    }
  }
}

function isMarkdownDocumentPath(source: string) {
  return /\.(?:md|markdown|mdx)(?:[?#].*)?$/i.test(source.trim())
}

function createRemoteImageView(node: Parameters<NodeViewConstructor>[0], copy: EditorCopy) {
  const container = document.createElement('span')
  container.className = 'remote-image-view'
  container.setAttribute('contenteditable', 'false')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'remote-image-control'
  button.textContent = copy.loadImage
  let currentNode = node
  let currentImage: HTMLImageElement | null = null

  const syncRuntimeAttributes = () => {
    const alt = String(currentNode.attrs.alt ?? '')
    const title = String(currentNode.attrs.title ?? '')
    button.setAttribute('aria-label', copy.loadRemoteImage(alt))
    if (!currentImage) return
    currentImage.alt = alt
    if (title) currentImage.title = title
    else currentImage.removeAttribute('title')
  }

  syncRuntimeAttributes()
  button.addEventListener('click', () => {
    button.disabled = true
    button.textContent = copy.loadingImage
    const image = document.createElement('img')
    currentImage = image
    syncRuntimeAttributes()
    image.addEventListener('load', () => {
      if (currentImage !== image) return
      container.replaceChildren(image)
    })
    image.addEventListener('error', () => {
      if (currentImage !== image) return
      button.disabled = false
      button.textContent = copy.loadImageError
    })
    image.src = String(currentNode.attrs.src ?? '')
  })
  container.append(button)
  return {
    dom: container,
    update: (nextNode: Parameters<NodeViewConstructor>[0]) => {
      if (
        nextNode.type !== currentNode.type
        || String(nextNode.attrs.src ?? '') !== String(currentNode.attrs.src ?? '')
        || !isExternalHttpUrl(String(nextNode.attrs.src ?? ''))
      ) return false
      currentNode = nextNode
      syncRuntimeAttributes()
      return true
    },
    ignoreMutation: () => true,
    destroy: () => {
      currentImage = null
    },
  }
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

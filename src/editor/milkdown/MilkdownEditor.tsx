import { createDocumentFind, moveFindMatch, setFindQuery, type FindState } from './documentFind'
import { DocumentFindBar } from './DocumentFindBar'
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  nodeViewCtx,
  prosePluginsCtx,
  rootCtx,
  serializerCtx,
  type CmdKey,
} from '@milkdown/core'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { commonmark } from '@milkdown/preset-commonmark'
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  autoInsertSpanPlugin,
  gfm,
} from '@milkdown/preset-gfm'
import { splitBlockAs } from '@milkdown/prose/commands'
import { Plugin, TextSelection, type Command } from '@milkdown/prose/state'
import { deleteColumn, deleteRow, TableView } from '@milkdown/prose/tables'
import type { EditorView, NodeViewConstructor } from '@milkdown/prose/view'
import { callCommand } from '@milkdown/utils'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PastedImage } from '../../file-system/nativeMarkdownFile'
import type { PresentationMode } from '../../app/presentationMode'
import { isExternalHttpUrl, openExternalLink } from '../../file-system/externalLink'
import { BlockHandle } from './BlockHandle'
import { BlockMenu } from './BlockMenu'
import { isValidBlockTarget, type BlockMenuCommand, type BlockTarget } from './blockControls'
import { EditorContextMenu } from './EditorContextMenu'
import { EditorLinkPopover, type LinkPopoverMode } from './EditorLinkPopover'
import { EditorOutline, type EditorHeading } from './EditorOutline'
import { ContextualEditorStore, createContextualEditorPlugin } from './contextualEditorStore'
import {
  createEditorCommands,
  isValidEditorSelectionSnapshot,
  splitTopLevelParagraphAtStart,
  type EditorCommands,
  type EditorSelectionSnapshot,
} from './editorCommands'
import { focusEditorViewPreservingSelection } from './editorFocus'
import { SelectionToolbar } from './SelectionToolbar'
import {
  createSafariCompositionHardbreakPlugin,
  miloSafariCompositionHardbreakSchema,
} from './safariCompositionHardbreak'
import { miloEmptyTableCellSerializer } from './tableEmptyCellSerializer'
import { miloTableAlignmentSchema } from './tableAlignment'
import { miloPrism } from './miloPrism'
import { defaultEditorCopy, type EditorCopy } from './editorCopy'
import {
  readContextMenuSelection,
  syncProseMirrorSelectionFromDOM,
  linkHrefAtSelection,
} from './editorSelection'
import {
  activeHeadingFromScroll,
  headingAtSelection,
  headingElement,
  headingElementResolver,
  headingScrollTop,
  readHeadings,
  type PendingHeadingNavigation,
} from './headingNavigation'
import { createCodeBlockNodeView } from './codeBlockNodeView'
import { createImageNodeView } from './imageNodeView'
import {
  createCompositionSaveBoundary,
  hasPendingComposition,
  type EditorComposition,
} from './compositionSaveBoundary'

const tableDefaultCellMinWidth = 100
const createTableNodeView: NodeViewConstructor = (node) =>
  new TableView(node, tableDefaultCellMinWidth)

type EditorMenu = {
  hasSelection: boolean
  inTable: boolean
  link: boolean
  selection: EditorSelectionSnapshot | null
  top: number
  left: number
}

type MilkdownEditorProps = {
  active?: boolean
  ariaLabel?: string
  copy?: Partial<EditorCopy>
  editorId?: string
  documentPath?: string | null
  initialMarkdown: string
  onRegisterFlush?: (flush: (() => boolean) | null) => void
  onMarkdownChange?: (markdown: string) => void
  onCompositionChange?: (state: EditorComposition) => void
  onPasteImage?: (image: PastedImage) => Promise<string | null>
  placeholder?: string
  presentationMode?: PresentationMode
  outlineLayout?: 'inline' | 'drawer'
  outlineMount?: HTMLElement | null
  outlineOpen?: boolean
  contextualOverlayMount?: HTMLElement | null
  onCloseOutline?: () => void
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
    dispatch?.(
      transaction
        .setSelection(TextSelection.create(transaction.doc, headingStart + 1))
        .scrollIntoView(),
    )
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

export function MilkdownEditor({
  active = true,
  ariaLabel = 'Untitled Markdown document',
  copy,
  editorId = 'standalone-editor',
  documentPath = null,
  initialMarkdown,
  onMarkdownChange,
  onRegisterFlush,
  onCompositionChange,
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
  const onRegisterFlushRef = useRef(onRegisterFlush)
  const onCompositionChangeRef = useRef(onCompositionChange)
  const onPasteImageRef = useRef(onPasteImage)
  const presentationModeRef = useRef<PresentationMode>(presentationMode)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<EditorMenu | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQueryState] = useState('')
  const [findResult, setFindResult] = useState<Pick<FindState, 'matches' | 'current'>>({
    matches: [],
    current: -1,
  })
  const [isReady, setIsReady] = useState(false)
  const [outlinePreferences, setOutlinePreferences] = useState(() => {
    const stored = Number(localStorage.getItem('milo-outline-depth') ?? 3)
    return {
      depth: stored >= 1 && stored <= 6 ? stored : 3,
      collapsed: new Set<string>() as ReadonlySet<string>,
    }
  })
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
  onRegisterFlushRef.current = onRegisterFlush
  onCompositionChangeRef.current = onCompositionChange
  onPasteImageRef.current = onPasteImage
  presentationModeRef.current = presentationMode
  ariaLabelRef.current = ariaLabel
  copyRef.current = editorCopy
  documentPathRef.current = documentPath

  headingsByPositionRef.current = useMemo(
    () => new Map(headings.map((heading) => [heading.pos, heading])),
    [headings],
  )

  useEffect(() => {
    const editorRoot = editorRootRef.current

    if (!editorRoot) {
      return undefined
    }

    let disposed = false
    let publishTimer: number | undefined
    let serializedDoc: import('@milkdown/prose/model').Node | null = null
    let serialized = ''
    let originalDoc: import('@milkdown/prose/model').Node | null = null
    let publishedDoc: import('@milkdown/prose/model').Node | null = null
    const serialize = (
      view: import('@milkdown/prose/view').EditorView,
      ctx: import('@milkdown/ctx').Ctx,
    ) => {
      if (serializedDoc !== view.state.doc) {
        serialized = originalDoc?.eq(view.state.doc)
          ? initialMarkdownRef.current
          : ctx.get(serializerCtx)(view.state.doc)
        serializedDoc = view.state.doc
      }
      return serialized
    }
    const publish = () => {
      if (disposed) return false
      window.clearTimeout(publishTimer)
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        if (hasPendingComposition(view)) return false
        if (publishedDoc !== view.state.doc) {
          publishedDoc = view.state.doc
          onMarkdownChangeRef.current?.(serialize(view, ctx))
        }
        return true
      })
    }
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, editorRoot)
        ctx.set(defaultValueCtx, initialMarkdownRef.current)
        ctx.update(prosePluginsCtx, (plugins) => [
          createDocumentFind((state) => {
            if (!disposed)
              setFindResult((current) =>
                current.matches === state.matches && current.current === state.current
                  ? current
                  : state,
              )
          }),
          createContextualEditorPlugin(contextualStoreRef.current!),
          createSafariCompositionHardbreakPlugin(),
          createCompositionSaveBoundary(
            (view) => serialize(view, ctx),
            (state) => {
              if (!disposed) onCompositionChangeRef.current?.(state)
            },
          ),
          new Plugin({
            view: (view) => ({
              update: (_view, previous) => {
                if (disposed || previous.doc === view.state.doc) return
                window.clearTimeout(publishTimer)
                publishTimer = window.setTimeout(publish, 150)
                const next = readHeadings(view.state)
                setHeadings((current) =>
                  current.length === next.length &&
                  current.every(
                    (h, i) =>
                      h.id === next[i].id &&
                      h.pos === next[i].pos &&
                      h.level === next[i].level &&
                      h.text === next[i].text,
                  )
                    ? current
                    : next,
                )
              },
            }),
            props: {
              handleKeyDown: (editorView, event) => {
                if (
                  event.key === 'Enter' &&
                  (event.metaKey || event.ctrlKey) &&
                  !event.shiftKey &&
                  !event.altKey &&
                  !editorView.composing
                ) {
                  syncProseMirrorSelectionFromDOM(editorView)
                  const handled = exitCodeOrTableAsParagraph(editorView.state, editorView.dispatch)
                  if (handled) editorView.focus()
                  return handled
                }

                if (
                  event.key !== 'Enter' ||
                  event.shiftKey ||
                  event.altKey ||
                  event.ctrlKey ||
                  event.metaKey ||
                  editorView.composing
                )
                  return false

                syncProseMirrorSelectionFromDOM(editorView)
                return (
                  splitTopLevelParagraphAtStart(editorView.state, editorView.dispatch) ||
                  exitHeadingAsParagraph(editorView.state, editorView.dispatch)
                )
              },
            },
          }),
          ...plugins,
        ])
        ctx.update(nodeViewCtx, (views) => [
          ...views,
          ['table', createTableNodeView] as [string, NodeViewConstructor],
          ['code_block', createCodeBlockNodeView(copyRef, presentationModeRef)] as [
            string,
            NodeViewConstructor,
          ],
          ['image', createImageNodeView(documentPathRef, copyRef)] as [string, NodeViewConstructor],
        ])
        ctx.get(listenerCtx).selectionUpdated((selectionCtx) => {
          if (disposed) {
            return
          }

          const editorView = selectionCtx.get(editorViewCtx)
          if (!editorView.state) return
          queueMicrotask(() => {
            if (disposed) return
            const currentView = selectionCtx.get(editorViewCtx)
            if (!disposed && currentView.state) {
              if (!currentView.state.selection.empty) setBlockMenuTarget(null)
              // Selection is only a secondary signal.  It closes the small
              // click-to-scroll race in edit mode; scrolling itself remains
              // the source of truth whenever the user moves the document.
              const selectedHeading = headingAtSelection(
                currentView.state,
                headingsByPositionRef.current,
              )
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

      proseMirror?.setAttribute('aria-label', ariaLabelRef.current)
      proseMirror?.setAttribute('tabindex', '0')
      proseMirror?.focus()
      editor.action((ctx) => {
        const editorState = ctx.get(editorViewCtx).state
        originalDoc = editorState.doc
        publishedDoc = editorState.doc
        setHeadings(readHeadings(editorState))
      })
      onRegisterFlushRef.current?.(publish)
      setIsReady(true)
    })

    return () => {
      disposed = true
      window.clearTimeout(publishTimer)
      onRegisterFlushRef.current?.(null)
      contextualStoreRef.current?.clear()
      editorRef.current = null
      void editor.destroy()
    }
  }, [])

  useEffect(() => {
    editorRootRef.current
      ?.querySelector<HTMLElement>('.ProseMirror')
      ?.setAttribute('aria-label', ariaLabel)
  }, [ariaLabel])

  useEffect(() => {
    if (!isReady) return

    editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      editorView.setProps({
        ...editorView.props,
        editable: () => presentationModeRef.current === 'edit',
      })
      editorView.dom.setAttribute('aria-readonly', String(presentationMode === 'read'))
    })
    editorRootRef.current
      ?.querySelectorAll<HTMLButtonElement>('.code-block-card__language-trigger')
      .forEach((trigger) => {
        trigger.disabled = presentationMode === 'read'
      })
    if (presentationMode === 'read') {
      editorRootRef.current
        ?.querySelectorAll<HTMLElement>('.code-block-card__language-menu')
        .forEach((menu) => {
          menu.hidden = true
        })
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
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target))
        setContextMenu(null)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
    }
  }, [contextMenu])

  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindQueryState('')
    editorRef.current?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      setFindQuery(view, '')
      focusEditorViewPreservingSelection(view)
    })
  }, [])
  useEffect(() => {
    if (!active) {
      setFindOpen(false)
      setFindQueryState('')
      if (isReady) editorRef.current?.action((ctx) => setFindQuery(ctx.get(editorViewCtx), ''))
      return
    }
    const open = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'f' ||
        event.shiftKey ||
        event.altKey
      )
        return
      event.preventDefault()
      if (isReady) {
        setFindOpen(true)
        editorRootRef.current?.querySelector<HTMLInputElement>('.document-find input')?.select()
      }
    }
    const openFromMenu = () => {
      if (isReady) setFindOpen(true)
    }
    window.addEventListener('milo:find', openFromMenu)
    window.addEventListener('keydown', open)
    return () => {
      window.removeEventListener('keydown', open)
      window.removeEventListener('milo:find', openFromMenu)
    }
  }, [active, isReady])

  useEffect(() => {
    if (active && findOpen && findResult.matches.length)
      editorRef.current?.action((ctx) => moveFindMatch(ctx.get(editorViewCtx), 0))
  }, [active, findOpen, findResult.matches])

  const insertImage = useCallback((src: string) => {
    editorRef.current?.action((ctx) => {
      const editorView = ctx.get(editorViewCtx)
      const image = editorView.state.schema.nodes.image
      if (!image) return
      editorView.dispatch(
        editorView.state.tr.replaceSelectionWith(image.create({ src, alt: '' })).scrollIntoView(),
      )
    })
  }, [])

  const pasteImage = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (presentationModeRef.current !== 'edit') return
      const image = Array.from(event.clipboardData.files ?? []).find((file) =>
        file.type.startsWith('image/'),
      )
      if (!image || !onPasteImageRef.current) return
      event.preventDefault()
      void image
        .arrayBuffer()
        .then((buffer) =>
          onPasteImageRef.current?.({
            bytes: Array.from(new Uint8Array(buffer)),
            mimeType: image.type,
          }),
        )
        .then((relativePath) => {
          if (relativePath) insertImage(relativePath)
        })
    },
    [insertImage],
  )

  const linkNavigationTarget = useCallback(
    (event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest<HTMLAnchorElement>('a[href]')
      const url = link?.getAttribute('href')
      if (!url || !isExternalHttpUrl(url)) return null
      return url
    },
    [],
  )

  const suppressModifierLinkPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        presentationModeRef.current !== 'edit' ||
        event.button !== 0 ||
        (!event.metaKey && !event.ctrlKey)
      )
        return
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
    },
    [linkNavigationTarget],
  )

  const openLinkOnCommandClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const url = linkNavigationTarget(event)
      if (!url) return
      const shouldOpen =
        presentationModeRef.current === 'read' ||
        event.metaKey ||
        event.ctrlKey ||
        linkNavigationPointerRef.current
      if (!shouldOpen) return
      event.preventDefault()
      event.stopPropagation()
      linkNavigationPointerRef.current = false
      void openExternalLink(url).catch(() => undefined)
    },
    [linkNavigationTarget],
  )

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

  const syncEditorSelectionFromDOM = useCallback(
    () =>
      editorRef.current?.action((ctx) => {
        const editorView = ctx.get(editorViewCtx)
        syncProseMirrorSelectionFromDOM(editorView)
      }),
    [],
  )

  // WebKit can defer ProseMirror's DOM-selection synchronization until after
  // a React portal interaction. Capture the native selection synchronously at
  // the Link boundary instead of trusting a previously rendered overlay state.
  const captureEditorSelection = useCallback(
    (allowCollapsed = false): EditorSelectionSnapshot | null =>
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
      }) ?? null,
    [],
  )

  const navigateToHeading = useCallback(
    (requestedHeading: EditorHeading): boolean => {
      if (!active) return false
      // A portal can outlive a document refresh for one React commit.  Resolve
      // the click through the current editor's position map, never an array
      // index, and refuse a stale heading identity rather than navigating a
      // different chapter.
      const heading = headingsByPositionRef.current.get(requestedHeading.pos)
      if (!heading || heading.key !== requestedHeading.key) return false

      const navigated =
        editorRef.current?.action((ctx) => {
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
    },
    [active],
  )

  useEffect(() => {
    if (!active || !isReady) return
    const stage = editorRootRef.current?.closest<HTMLElement>('.document-stage')
    if (!stage) return
    const updateActiveHeading = () => {
      const pending = pendingNavigationRef.current

      if (pending) {
        setActiveHeadingPosition((previous) => (previous === pending.pos ? previous : pending.pos))
        return
      }

      const current =
        editorRef.current?.action((ctx) => {
          const resolve = headingElementResolver(ctx.get(editorViewCtx))
          return activeHeadingFromScroll(
            headings,
            (pos) => {
              const heading = headingsByPositionRef.current.get(pos)
              return heading ? resolve(heading) : null
            },
            stage,
          )
        }) ?? null
      setActiveHeadingPosition((previous) => (previous === current ? previous : current))
    }
    const onScroll = () => {
      // WKWebView may report this page hidden while the native window is
      // interactive and suspend animation frames indefinitely. Scroll events
      // already follow rendering cadence; do not gate navigation state on rAF.
      updateActiveHeading()
    }
    const cancelPendingNavigation = () => {
      pendingNavigationRef.current = null
    }
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
    }
  }, [active, headings, isReady])

  const restoreSelection = useCallback(
    (editorView: EditorView, selection?: EditorSelectionSnapshot) => {
      if (!selection) return true
      if (!isValidEditorSelectionSnapshot(editorView.state, selection)) return false
      editorView.dispatch(
        editorView.state.tr.setSelection(
          TextSelection.create(editorView.state.doc, selection.from, selection.to),
        ),
      )
      return true
    },
    [],
  )

  const runEditorCommand = useCallback(
    <T,>(command: CmdKey<T>, payload?: T, selection?: EditorSelectionSnapshot) => {
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
    },
    [focusEditor, restoreSelection, syncEditorSelectionFromDOM],
  )

  const runProseCommand = useCallback(
    (command: Command, selection?: EditorSelectionSnapshot) => {
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
    },
    [focusEditor, restoreSelection],
  )

  const editorCommands: EditorCommands = useMemo(
    () =>
      createEditorCommands({
        runMilkdown: runEditorCommand,
        runProse: runProseCommand,
        readState: () => editorRef.current?.action((ctx) => ctx.get(editorViewCtx).state) ?? null,
      }),
    [runEditorCommand, runProseCommand],
  )

  const pasteLink = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (presentationModeRef.current !== 'edit') return
      const href = event.clipboardData.getData('text/plain').trim()
      if (!isExternalHttpUrl(href)) return
      const selection = captureEditorSelection(true)
      if (!selection) return
      const applied =
        selection.from === selection.to
          ? editorCommands.insertLink(href, href, selection)
          : editorCommands.applyLinkToSelection(href, selection)
      if (applied) event.preventDefault()
    },
    [captureEditorSelection, editorCommands],
  )

  const openLinkEditor = useCallback(
    (
      mode: LinkPopoverMode,
      selection: EditorSelectionSnapshot | null,
      href = '',
      anchor: { left: number; top: number } | null = null,
    ) => {
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
      setLinkText(mode === 'insert' ? '' : (selection?.text ?? ''))
      setLinkUrl(href)
      setLinkAnchor(resolvedAnchor)
      setBlockMenuTarget(null)
      setLinkEditorOpen(true)
    },
    [],
  )

  const openLinkEditorForSelection = useCallback(
    (selection: EditorSelectionSnapshot, anchor: { left: number; top: number } | null = null) => {
      if (selection.from === selection.to) {
        openLinkEditor('insert', selection, '', anchor)
        return
      }
      const href = linkHrefAtSelection(selection)
      openLinkEditor(href ? 'edit' : 'create-from-selection', selection, href ?? '', anchor)
    },
    [openLinkEditor],
  )

  const openSelectionLinkEditor = useCallback(
    (anchor: { left: number; top: number } | null = null) => {
      const selection = captureEditorSelection()
      if (!selection) return
      openLinkEditorForSelection(selection, anchor)
    },
    [captureEditorSelection, openLinkEditorForSelection],
  )

  const openInsertLinkEditor = useCallback(
    (anchor: { left: number; top: number } | null = null) => {
      const selection = captureEditorSelection(true)
      if (!selection || selection.from !== selection.to) return
      openLinkEditorForSelection(selection, anchor)
    },
    [captureEditorSelection, openLinkEditorForSelection],
  )

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
  }, [
    active,
    captureEditorSelection,
    openInsertLinkEditor,
    openSelectionLinkEditor,
    presentationMode,
  ])

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
    const applied =
      linkMode === 'insert'
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

  const containsContextualInteraction = useCallback(
    (target: EventTarget | null) =>
      target instanceof Node &&
      (editorRootRef.current?.contains(target) ||
        contextualOverlayMount?.contains(target) ||
        false),
    [contextualOverlayMount],
  )

  const closeBlockMenu = useCallback(() => setBlockMenuTarget(null), [])

  const runBlockMenuCommand = useCallback(
    (command: BlockMenuCommand, target: BlockTarget) => {
      const valid =
        active &&
        presentationModeRef.current === 'edit' &&
        editorRef.current?.action((ctx) => {
          const state = ctx.get(editorViewCtx).state
          return isValidBlockTarget(state, editorId, target)
        })
      if (!valid) {
        closeBlockMenu()
        return
      }

      switch (command) {
        case 'paragraph':
          editorCommands.setParagraph(target.selection)
          break
        case 'heading-1':
          editorCommands.setHeading1(target.selection)
          break
        case 'heading-2':
          editorCommands.setHeading2(target.selection)
          break
        case 'heading-3':
          editorCommands.setHeading3(target.selection)
          break
        case 'heading-4':
          editorCommands.setHeading4(target.selection)
          break
        case 'heading-5':
          editorCommands.setHeading5(target.selection)
          break
        case 'heading-6':
          editorCommands.setHeading6(target.selection)
          break
        case 'blockquote':
          editorCommands.setQuote(target.selection)
          break
        case 'bullet-list':
          editorCommands.toggleBulletList(target.selection)
          break
        case 'ordered-list':
          editorCommands.toggleOrderedList(target.selection)
          break
        case 'code-block':
          editorCommands.setCodeBlock(target.selection)
          break
        case 'table':
          editorCommands.insertTable(target.selection)
          break
        case 'divider': {
          if (editorCommands.insertDivider(target)) focusEditorView()
          break
        }
        case 'delete-block':
          editorCommands.deleteBlock(target)
          break
      }
      closeBlockMenu()
    },
    [active, closeBlockMenu, editorCommands, editorId, focusEditorView],
  )

  useEffect(() => {
    if (!active || presentationMode !== 'edit' || linkEditorOpen) closeBlockMenu()
  }, [active, closeBlockMenu, linkEditorOpen, presentationMode])

  useEffect(() => {
    if (!linkEditorOpen) return undefined
    const stage = editorRootRef.current?.closest<HTMLElement>('.document-stage')
    stage?.addEventListener('scroll', cancelLinkEditor, { passive: true })
    return () => stage?.removeEventListener('scroll', cancelLinkEditor)
  }, [cancelLinkEditor, linkEditorOpen])

  const runTableCommand = useCallback(
    (command: typeof addRowBeforeCommand) => {
      editorRef.current?.action(callCommand(command.key))
      setContextMenu(null)
      focusEditor()
    },
    [focusEditor],
  )

  const runTableProseCommand = useCallback(
    (command: Command) => {
      editorRef.current?.action((ctx) => {
        const editorView = ctx.get(editorViewCtx)
        return command(editorView.state, editorView.dispatch)
      })
      setContextMenu(null)
      focusEditor()
    },
    [focusEditor],
  )

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
      top: Math.max(
        8,
        Math.min(event.clientY, window.innerHeight - (menuState.inTable ? 420 : 250)),
      ),
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)),
    })
  }, [])

  const runContextCommand = useCallback(
    (command: 'cut' | 'copy' | 'select-all' | 'bold' | 'italic' | 'link') => {
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
    },
    [contextMenu, editorCommands, focusEditor, openLinkEditorForSelection],
  )

  const runContextTableCommand = useCallback(
    (
      command:
        | 'row-before'
        | 'row-after'
        | 'column-before'
        | 'column-after'
        | 'delete-row'
        | 'delete-column',
    ) => {
      switch (command) {
        case 'row-before':
          runTableCommand(addRowBeforeCommand)
          break
        case 'row-after':
          runTableCommand(addRowAfterCommand)
          break
        case 'column-before':
          runTableCommand(addColBeforeCommand)
          break
        case 'column-after':
          runTableCommand(addColAfterCommand)
          break
        case 'delete-row':
          runTableProseCommand(deleteRow)
          break
        case 'delete-column':
          runTableProseCommand(deleteColumn)
          break
      }
    },
    [runTableCommand, runTableProseCommand],
  )

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
      {findOpen && active ? (
        <DocumentFindBar
          copy={editorCopy}
          query={findQuery}
          count={findResult.matches.length}
          current={findResult.current}
          onQuery={(query) => {
            setFindQueryState(query)
            editorRef.current?.action((ctx) => setFindQuery(ctx.get(editorViewCtx), query))
          }}
          onMove={(direction) =>
            editorRef.current?.action((ctx) => moveFindMatch(ctx.get(editorViewCtx), direction))
          }
          onClose={closeFind}
        />
      ) : null}
      {contextualOverlayMount && active && presentationMode === 'edit'
        ? createPortal(
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
          )
        : null}
      {outlineMount && (outlineLayout === 'inline' || outlineOpen)
        ? createPortal(
            <>
              {outlineOpen && outlineLayout === 'drawer' ? (
                <div aria-hidden="true" className="outline-backdrop" onMouseDown={onCloseOutline} />
              ) : null}
              <EditorOutline
                preferences={outlinePreferences}
                depthLabel={editorCopy.outlineDepth}
                collapseLabel={editorCopy.collapseSection}
                expandLabel={editorCopy.expandSection}
                onPreferencesChange={(preferences) => {
                  setOutlinePreferences(preferences)
                  localStorage.setItem('milo-outline-depth', String(preferences.depth))
                }}
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
          )
        : null}
      <span aria-hidden="true" className="milkdown-editor__empty-state">
        <span className="milkdown-editor__placeholder">
          {placeholder ?? editorCopy.startWriting}
        </span>
        <span className="milkdown-editor__hint">{editorCopy.startWritingHint}</span>
      </span>
      {presentationMode === 'edit' && contextMenu ? (
        <EditorContextMenu
          ref={contextMenuRef}
          copy={editorCopy}
          hasSelection={contextMenu.hasSelection}
          inTable={contextMenu.inTable}
          linkLabel={
            contextMenu.link
              ? editorCopy.editLink
              : contextMenu.hasSelection
                ? editorCopy.addLink
                : editorCopy.insertLink
          }
          position={{ left: contextMenu.left, top: contextMenu.top }}
          onCommand={runContextCommand}
          onDismiss={dismissContextMenu}
          onTableCommand={runContextTableCommand}
        />
      ) : null}
    </div>
  )
}

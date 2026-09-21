import { hardbreakSchema } from '@milkdown/preset-commonmark'
import { DOMParser as ProseMirrorDOMParser, type ParseOptions } from '@milkdown/prose/model'
import { Plugin } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'

const compositionDeleteRoots = new WeakSet<HTMLElement>()

function setCompositionDeleteActive(view: EditorView, active: boolean) {
  const root = view.dom
  if (active) compositionDeleteRoots.add(root)
  else compositionDeleteRoots.delete(root)
}

function isCompositionTextDeletion(event: Event) {
  const input = event as InputEvent
  return input.inputType === 'deleteCompositionText' && input.isComposing
}

export function isSafariCompositionReplacementBreak(dom: Node | string, compositionDeleteActive: boolean) {
  if (!compositionDeleteActive || !(dom instanceof HTMLElement) || dom.tagName !== 'BR' || dom.attributes.length !== 0) return false

  const parent = dom.parentElement
  const editorRoot = parent?.closest<HTMLElement>('.ProseMirror')
  if (!parent || !editorRoot) return false

  const replacedParagraphAtRoot = parent === editorRoot
  const placeholderInsideParagraph = parent.tagName === 'P'
    && parent.childNodes.length === 1
    && parent.firstChild === dom

  return replacedParagraphAtRoot || placeholderInsideParagraph
}

function isSafariEmptyCompositionBreak(dom: Node | string) {
  const parent = dom instanceof HTMLElement ? dom.parentElement : null
  const editorRoot = parent?.closest<HTMLElement>('.ProseMirror')
  return isSafariCompositionReplacementBreak(
    dom,
    editorRoot != null && compositionDeleteRoots.has(editorRoot),
  )
}

type InternalParseOptions = ParseOptions & {
  ruleFromNode?: (dom: Node) => object | null
}

class SafariCompositionDOMParser extends ProseMirrorDOMParser {
  constructor(schema: Parameters<typeof ProseMirrorDOMParser.fromSchema>[0]) {
    const base = ProseMirrorDOMParser.fromSchema(schema)
    super(schema, base.rules)
  }

  private guardOptions(options?: ParseOptions): ParseOptions {
    const internalOptions = options as InternalParseOptions | undefined
    const ruleFromNode = internalOptions?.ruleFromNode
    return {
      ...options,
      ruleFromNode: (dom: Node) => {
        const artifact = isSafariEmptyCompositionBreak(dom)
        return artifact ? { ignore: true } : ruleFromNode?.(dom) ?? null
      },
    } as InternalParseOptions
  }

  override parse(dom: Node, options?: ParseOptions) {
    return super.parse(dom, this.guardOptions(options))
  }

  override parseSlice(dom: Node, options?: ParseOptions) {
    return super.parseSlice(dom, this.guardOptions(options))
  }
}

// WKWebView replaces an active composition with a single bare <br> during
// deleteCompositionText. ProseMirror observes that mutation before it adds
// its own trailing-break DOM hack, so the schema parser must combine the exact
// DOM shape with the short-lived native input lifecycle. Authored hardbreaks
// carry attributes and paste/Markdown parsing has no active editor marker.
export const miloSafariCompositionHardbreakSchema = hardbreakSchema.extendSchema((base) => (ctx) => {
  const schema = base(ctx)
  return {
    ...schema,
    parseDOM: [
      {
        tag: 'br',
        getAttrs: (dom: Node | string) => isSafariEmptyCompositionBreak(dom) ? false : null,
      },
      ...(schema.parseDOM ?? []).filter((rule) => rule.tag !== 'br'),
    ],
  }
})

export function createSafariCompositionHardbreakPlugin() {
  let domParser: ProseMirrorDOMParser | null = null
  const domParserProxy = {
    parse: (dom: Node, options?: ParseOptions) => {
      if (!domParser) throw new Error('Safari composition DOM parser used before editor state initialization')
      return domParser.parse(dom, options)
    },
    parseSlice: (dom: Node, options?: ParseOptions) => {
      if (!domParser) throw new Error('Safari composition DOM parser used before editor state initialization')
      return domParser.parseSlice(dom, options)
    },
  } as ProseMirrorDOMParser

  return new Plugin({
    state: {
      init: (_, state) => {
        domParser = new SafariCompositionDOMParser(state.schema)
        return null
      },
      apply: () => null,
    },
    props: {
      domParser: domParserProxy,
      handleDOMEvents: {
        compositionstart: (view) => {
          setCompositionDeleteActive(view, false)
          return false
        },
        beforeinput: (view, event) => {
          setCompositionDeleteActive(view, isCompositionTextDeletion(event))
          return false
        },
        compositionend: (view) => {
          setCompositionDeleteActive(view, false)
          return false
        },
        blur: (view) => {
          setCompositionDeleteActive(view, false)
          return false
        },
      },
    },
    view: (view) => ({
      destroy: () => setCompositionDeleteActive(view, false),
    }),
  })
}

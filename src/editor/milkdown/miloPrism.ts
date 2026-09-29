import { prismConfig } from '@milkdown/plugin-prism'
import { findChildren } from '@milkdown/prose'
import { Plugin, PluginKey, type EditorState } from '@milkdown/prose/state'
import type { Node } from '@milkdown/prose/model'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import { $prose } from '@milkdown/utils'
import { refractor, type Refractor } from 'refractor/core'

type HighlightNode = {
  type: string
  value?: string
  children?: HighlightNode[]
  properties?: { className?: string[] }
}

type HighlightedLeaf = { text: string; className: string[] }

function flattenHighlightedNodes(nodes: HighlightNode[], className: string[] = []): HighlightedLeaf[] {
  return nodes.flatMap((node) => node.type === 'element'
    ? flattenHighlightedNodes(node.children ?? [], [...className, ...(node.properties?.className ?? [])])
    : [{ text: node.value ?? '', className }])
}

function blockDecorations(node: Node, position: number, instance: Refractor) {
  const language = node.attrs.language ?? ''
  if (!language || !instance.listLanguages().includes(language)) return []

  let from = position + 1
  return flattenHighlightedNodes(instance.highlight(node.textContent, language).children as HighlightNode[])
    .flatMap(({ text, className }) => {
      const to = from + text.length
      from = to
      return className.length ? [Decoration.inline(to - text.length, to, { class: className.join(' ') })] : []
    })
}

function changedCodeBlock(previous: EditorState, next: EditorState) {
  const from = previous.doc.content.findDiffStart(next.doc.content)
  if (from == null) return null
  const diff = previous.doc.content.findDiffEnd(next.doc.content)
  if (!diff) return null
  const to = Math.max(diff.b, from)
  const $from = next.doc.resolve(from)
  const $to = next.doc.resolve(to)
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return null
  return { node: $from.parent, pos: $from.before($from.depth) }
}

function decorations(doc: Node, name: string, instance: Refractor) {
  const entries = findChildren((node) => node.type.name === name)(doc)
  const ranges = entries.flatMap(({ node, pos }) => blockDecorations(node, pos, instance))
  return DecorationSet.create(doc, ranges)
}

const miloPrismPlugin = $prose((ctx) => {
  const { configureRefractor } = ctx.get(prismConfig.key)
  const instance = configureRefractor(refractor) ?? refractor
  const name = 'code_block'

  return new Plugin({
    key: new PluginKey('MILO_PRISM'),
    state: {
      init: (_, { doc }) => decorations(doc, name, instance),
      apply: (transaction, decorationSet, oldState, state) => {
        if (!transaction.docChanged) return decorationSet
        const edited = changedCodeBlock(oldState, state)
        if (edited) {
          const mapped = decorationSet.map(transaction.mapping, transaction.doc)
          if (edited.node.type.name !== name) return mapped
          const from = edited.pos
          const to = from + edited.node.nodeSize
          return mapped.remove(mapped.find(from + 1, to - 1)).add(
            transaction.doc,
            blockDecorations(edited.node, from, instance),
          )
        }

        const codeBlock = state.selection.$head.parent.type.name === name
        const previousCodeBlock = oldState.selection.$head.parent.type.name === name
        const codeBlocksChanged = (() => {
          const oldNodes = findChildren((node) => node.type.name === name)(oldState.doc)
          const newNodes = findChildren((node) => node.type.name === name)(state.doc)
          return oldNodes.length !== newNodes.length
            || oldNodes.some((entry, index) => entry.node.attrs.language !== newNodes[index]?.node.attrs.language)
            || transaction.steps.some((step) => {
              const rangedStep = step as unknown as { from?: number; to?: number }
              return rangedStep.from !== undefined && rangedStep.to !== undefined && oldNodes.some((entry) => (
                entry.pos >= rangedStep.from! && entry.pos + entry.node.nodeSize <= rangedStep.to!
              ))
            })
        })()

        return codeBlock || previousCodeBlock || codeBlocksChanged
          ? decorations(transaction.doc, name, instance)
          : decorationSet.map(transaction.mapping, transaction.doc)
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
})

export const miloPrism = [miloPrismPlugin, prismConfig]

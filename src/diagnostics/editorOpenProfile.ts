import { createInputResponseProbe } from './inputResponseProbe'
import type { MilkdownPlugin } from '@milkdown/ctx'
import { createTimer } from '@milkdown/ctx'
import { editorStateOptionsCtx, editorStateTimerCtx, ParserReady, parserCtx } from '@milkdown/core'
import { Plugin } from '@milkdown/prose/state'
import {
  bindProfileDocument,
  profileMeasure,
  markProfile,
  recordRuntime,
  type OpenProfile,
} from './openProfile'

export function createOpenProfilePlugin(profile: OpenProfile): MilkdownPlugin {
  const wrapped = createTimer('MiloProfileParserWrapped')
  return (ctx) => {
    ctx.record(wrapped).update(editorStateTimerCtx, (timers) => [...timers, wrapped])
    return async () => {
      await ctx.wait(ParserReady)
      ctx.update(parserCtx, (parser) => (value) => {
        const doc = profileMeasure(profile, 'milkdown-parse', () => parser(value))
        if (doc) bindProfileDocument(doc, profile)
        return doc
      })
      const input = createInputResponseProbe(() => performance.now(), recordRuntime)
      ctx.update(editorStateOptionsCtx, (override) => (options) => {
        const configured = override(options)
        markProfile(profile, 'plugin-state-init-start')
        return {
          ...configured,
          plugins: [
            ...(configured.plugins ?? []),
            new Plugin({
              state: {
                init: () => {
                  markProfile(profile, 'plugin-state-init-end')
                  return null
                },
                apply: (_transaction, value) => value,
              },
              view: () => {
                markProfile(profile, 'view-dom-built')
                return {}
              },
              props: {
                handleDOMEvents: {
                  keydown: (_view, event) => {
                    input.keydown(event)
                    return false
                  },
                  keyup: () => {
                    input.reset()
                    return false
                  },
                  beforeinput: (_view, event) => {
                    input.beforeinput(event)
                    return false
                  },
                  compositionstart: () => {
                    input.reset()
                    return false
                  },
                  blur: () => {
                    input.reset()
                    return false
                  },
                },
              },
            }),
            new Plugin({
              view: () => ({
                update: (view, previous) => {
                  if (previous.doc === view.state.doc) return
                  input.modelChanged()
                },
              }),
            }),
          ],
        }
      })
      ctx.done(wrapped)
      return () => {
        ctx.clearTimer(wrapped)
      }
    }
  }
}

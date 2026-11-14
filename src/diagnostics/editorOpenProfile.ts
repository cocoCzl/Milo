import type { MilkdownPlugin } from '@milkdown/ctx'
import { createTimer } from '@milkdown/ctx'
import { editorStateOptionsCtx, editorStateTimerCtx, ParserReady, parserCtx } from '@milkdown/core'
import { Plugin } from '@milkdown/prose/state'
import {
  bindProfileDocument,
  profileMeasure,
  markProfile,
  emitProfile,
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
                handleKeyDown: (_view, event) => {
                  if (event.isTrusted && !profile.inputRecorded)
                    profile.inputStart = performance.now()
                  return false
                },
              },
            }),
            new Plugin({
              view: () => ({
                update: (view, previous) => {
                  if (
                    profile.inputStart !== undefined &&
                    !profile.inputRecorded &&
                    previous.doc !== view.state.doc
                  ) {
                    profile.inputRecorded = true
                    profile.entries.push({
                      stage: 'trusted-key-to-model-change',
                      ms: performance.now() - profile.inputStart,
                      endMs: performance.now() - profile.started,
                    })
                    emitProfile(profile, 'input-probe')
                  }
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

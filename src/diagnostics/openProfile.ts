// Opt-in local measurement only. Vite removes this path from ordinary builds.
import { invoke } from '@tauri-apps/api/core'
import type { MilkdownPlugin } from '@milkdown/ctx'
import { createTimer } from '@milkdown/ctx'
import { editorStateOptionsCtx, editorStateTimerCtx, ParserReady, parserCtx } from '@milkdown/core'
import { Plugin } from '@milkdown/prose/state'
import type { Node } from '@milkdown/prose/model'

const profileEnabled = () => import.meta.env.VITE_MILO_PROFILE === '1'
type Entry = { stage: string; ms: number; endMs: number }
export type OpenProfile = {
  path: string
  source: string
  started: number
  epochMs: number
  entries: Entry[]
  marks: Record<string, number>
  bytes?: number
  inputStart?: number
  inputRecorded?: boolean
}
const pending = new Map<string, OpenProfile>()
const documents = new WeakMap<Node, OpenProfile>()

export function startOpenProfile(path: string, source: string): OpenProfile | undefined {
  if (!profileEnabled()) return
  return { path, source, started: performance.now(), epochMs: Date.now(), entries: [], marks: {} }
}
export function profileMeasure<T>(
  profile: OpenProfile | undefined,
  stage: string,
  operation: () => T,
): T {
  if (!profile) return operation()
  const start = performance.now()
  try {
    return operation()
  } finally {
    profile.entries.push({
      stage,
      ms: performance.now() - start,
      endMs: performance.now() - profile.started,
    })
  }
}
export async function profileAsync<T>(
  profile: OpenProfile | undefined,
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!profile) return operation()
  const start = performance.now()
  try {
    return await operation()
  } finally {
    profile.entries.push({
      stage,
      ms: performance.now() - start,
      endMs: performance.now() - profile.started,
    })
  }
}
export function stageOpenProfile(path: string, profile: OpenProfile | undefined, markdown: string) {
  if (!profile) return
  profile.bytes = new TextEncoder().encode(markdown).length
  pending.set(path, profile)
}
export function takeOpenProfile(path: string | null) {
  if (!profileEnabled() || !path) return
  const profile = pending.get(path)
  pending.delete(path)
  return profile
}
export function profileDocument<T>(doc: Node, stage: string, operation: () => T): T {
  return profileMeasure(profileEnabled() ? documents.get(doc) : undefined, stage, operation)
}
export function markProfile(profile: OpenProfile | undefined, stage: string) {
  if (profile) profile.marks[stage] = performance.now() - profile.started
}
export function emitProfile(profile: OpenProfile | undefined, phase: string) {
  if (!profile) return
  // No content or keystrokes. Errors in optional diagnostics never prevent opening.
  void invoke('record_open_profile', {
    record: {
      kind: 'frontend',
      phase,
      path: profile.path,
      source: profile.source,
      epochMs: profile.epochMs,
      bytes: profile.bytes,
      entries: [...profile.entries],
      marks: { ...profile.marks },
      build: import.meta.env.VITE_MILO_PROFILE_COMMIT ?? 'unspecified',
    },
  }).catch((reason) => console.error('Milo open profile could not be recorded', reason))
}
export function createOpenProfilePlugin(profile: OpenProfile): MilkdownPlugin {
  const wrapped = createTimer('MiloProfileParserWrapped')
  return (ctx) => {
    ctx.record(wrapped).update(editorStateTimerCtx, (timers) => [...timers, wrapped])
    return async () => {
      await ctx.wait(ParserReady)
      ctx.update(parserCtx, (parser) => (value) => {
        const doc = profileMeasure(profile, 'milkdown-parse', () => parser(value))
        if (doc) documents.set(doc, profile)
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

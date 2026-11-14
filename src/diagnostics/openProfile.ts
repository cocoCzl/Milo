// Opt-in local measurement only. Ordinary builds retain helpers but record nothing.
import { invoke } from '@tauri-apps/api/core'
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
      source: profile.source,
      epochMs: profile.epochMs,
      bytes: profile.bytes,
      entries: [...profile.entries],
      marks: { ...profile.marks },
      build: import.meta.env.VITE_MILO_PROFILE_COMMIT ?? 'unspecified',
    },
  }).catch(() => console.error('Milo open profile could not be recorded'))
}

export function bindProfileDocument(doc: Node, profile: OpenProfile) {
  documents.set(doc, profile)
}

export type RuntimeMetric = { count: number; totalMs: number; maxMs: number; recentMs: number[] }
const runtimeMetrics: Record<string, RuntimeMetric> = {}
if (profileEnabled())
  (globalThis as typeof globalThis & { __miloMetrics?: typeof runtimeMetrics }).__miloMetrics =
    runtimeMetrics
function recordRuntime(stage: string, ms: number) {
  const metric = (runtimeMetrics[stage] ??= { count: 0, totalMs: 0, maxMs: 0, recentMs: [] })
  metric.count++
  metric.totalMs += ms
  metric.maxMs = Math.max(metric.maxMs, ms)
  metric.recentMs.push(ms)
  if (metric.recentMs.length > 128) metric.recentMs.shift()
}
export function measureRuntime<T>(stage: string, operation: () => T): T {
  if (!profileEnabled()) return operation()
  const start = performance.now()
  try {
    return operation()
  } finally {
    recordRuntime(stage, performance.now() - start)
  }
}
export async function measureRuntimeAsync<T>(
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!profileEnabled()) return operation()
  const start = performance.now()
  try {
    return await operation()
  } finally {
    recordRuntime(stage, performance.now() - start)
  }
}

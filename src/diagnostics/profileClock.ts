import { invoke } from '@tauri-apps/api/core'

export const profilingEnabled = () => import.meta.env.VITE_MILO_PROFILE === '1'
export type ClockSample = { frontendStart: number; frontendEnd: number; nativeMs: number }
export function selectClockSample(samples: ClockSample[]) {
  const best = samples.reduce((a, b) =>
    b.frontendEnd - b.frontendStart < a.frontendEnd - a.frontendStart ? b : a,
  )
  const roundTripMs = best.frontendEnd - best.frontendStart
  return {
    frontendToNativeOffsetMs: best.nativeMs - (best.frontendStart + best.frontendEnd) / 2,
    uncertaintyMs: roundTripMs / 2,
    roundTripMs,
    samples: samples.length,
  }
}
let clock: Promise<ReturnType<typeof selectClockSample> | undefined> | undefined
const lifecycle: Record<string, number> = {}
async function calibrate() {
  const samples: ClockSample[] = []
  for (let i = 0; i < 5; i++) {
    const frontendStart = performance.now()
    const reply = await invoke<{ nativeMs: number }>('profile_clock')
    const frontendEnd = performance.now()
    if (!Number.isFinite(reply?.nativeMs)) return
    samples.push({ frontendStart, frontendEnd, nativeMs: reply.nativeMs })
  }
  return selectClockSample(samples)
}
export function beginProfilePage() {
  if (!profilingEnabled()) return
  lifecycle['page-navigation-origin'] = 0
  markLifecycle('page-module-ready')
  clock ??= calibrate().catch(() => undefined)
}
export async function recordProfile(record: Record<string, unknown>) {
  if (!profilingEnabled()) return
  clock ??= calibrate().catch(() => undefined)
  await invoke('record_open_profile', {
    record: {
      ...record,
      clock: await clock,
      pageTimeOrigin: performance.timeOrigin,
      build: import.meta.env.VITE_MILO_PROFILE_COMMIT ?? 'unspecified',
    },
  })
}
export function markLifecycle(stage: string) {
  if (!profilingEnabled() || lifecycle[stage] !== undefined) return
  lifecycle[stage] = performance.now()
  if (stage === 'home-controls-ready' || stage === 'editor-accepts-input')
    void recordProfile({ kind: 'lifecycle', marks: { ...lifecycle } }).catch(() =>
      console.error('Could not record local lifecycle profile'),
    )
}

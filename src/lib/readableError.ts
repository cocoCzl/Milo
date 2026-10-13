export function readableError(reason: unknown, fallback: string): string {
  if (typeof reason === 'string' && reason) return reason
  return reason instanceof Error && reason.message ? reason.message : fallback
}

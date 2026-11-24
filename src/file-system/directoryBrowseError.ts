type DirectoryErrorCopy = { pageExpired: string; entryLimit: string; byteLimit: string }
export function directoryBrowseError(reason: unknown, copy: DirectoryErrorCopy): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (message.includes('DIRECTORY_ENTRY_LIMIT:')) return copy.entryLimit
  if (message.includes('DIRECTORY_BYTE_LIMIT:')) return copy.byteLimit
  if (message.includes('DIRECTORY_SNAPSHOT_STALE:')) return copy.pageExpired
  return message
}

// Match only known OS permission/read-only failures; retain unknown errors.
export function isWritePermissionError(error: string) {
  return /permission denied|operation not permitted|read-only file system|os error (?:1|13|30)\b|NSCocoaErrorDomain[^\n]*Code=513\b|NSPOSIXErrorDomain[^\n]*Code=(?:1|13|30)\b/i.test(
    error,
  )
}

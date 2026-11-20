import type { InterfaceCopy } from './interfaceCopy'

import { isWritePermissionError } from '../lib/writePermissionError'

export function SaveErrorMessage({ error, copy }: { error: string; copy: InterfaceCopy }) {
  const permission = isWritePermissionError(error)
  return (
    <div className="save-error-message">
      <span>{permission ? copy.writePermissionDenied : error}</span>
      <span>{copy.saveChangesRetained}</span>
      {permission ? (
        <details>
          <summary>{copy.originalError}</summary>
          <pre>{error}</pre>
        </details>
      ) : null}
    </div>
  )
}

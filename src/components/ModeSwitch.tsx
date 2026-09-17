import type { PresentationMode } from '../app/presentationMode'

type ModeSwitchProps = {
  disabled?: boolean
  editLabel: string
  mode: PresentationMode
  onChange: (mode: PresentationMode) => void
  readLabel: string
}

export function ModeSwitch({ disabled = false, editLabel, mode, onChange, readLabel }: ModeSwitchProps) {
  return (
    <div className="mode-switch" aria-label={`${editLabel} / ${readLabel}`} role="group">
      <button
        aria-pressed={mode === 'edit'}
        disabled={disabled}
        type="button"
        onClick={() => onChange('edit')}
      >
        {editLabel}
      </button>
      <button
        aria-pressed={mode === 'read'}
        disabled={disabled}
        type="button"
        onClick={() => onChange('read')}
      >
        {readLabel}
      </button>
    </div>
  )
}

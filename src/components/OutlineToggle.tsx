import { ListTree } from 'lucide-react'
import type { Ref } from 'react'

import { Tooltip } from './Tooltip'

type OutlineToggleProps = {
  expanded: boolean
  label: string
  tooltipLabel: string
  onClick: () => void
  buttonRef?: Ref<HTMLButtonElement>
}

export function OutlineToggle({ buttonRef, expanded, label, onClick, tooltipLabel }: OutlineToggleProps) {
  return (
    <Tooltip content={tooltipLabel}>
      <button ref={buttonRef} aria-controls="outline-drawer" aria-expanded={expanded} aria-label={tooltipLabel} className="outline-toggle" type="button" onClick={onClick}>
        <ListTree aria-hidden="true" size={16} strokeWidth={1.8} />
        <span>{label}</span>
      </button>
    </Tooltip>
  )
}

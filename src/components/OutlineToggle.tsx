import { ListTree } from 'lucide-react'
import type { Ref } from 'react'

type OutlineToggleProps = {
  expanded: boolean
  label: string
  onClick: () => void
  buttonRef?: Ref<HTMLButtonElement>
}

export function OutlineToggle({ buttonRef, expanded, label, onClick }: OutlineToggleProps) {
  return (
    <button ref={buttonRef} aria-controls="outline-drawer" aria-expanded={expanded} aria-label={label} className="outline-toggle" type="button" onClick={onClick}>
      <ListTree aria-hidden="true" size={16} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  )
}

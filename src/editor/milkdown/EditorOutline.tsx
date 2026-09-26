import { ListTree, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

export type EditorHeading = {
  id: string
  key: string
  level: number
  pos: number
  text: string
}

type EditorOutlineProps = {
  emptyLabel: string
  activePosition: number | null
  closeLabel: string
  drawer: boolean
  headings: EditorHeading[]
  label: string
  onSelect: (heading: EditorHeading) => void
  onClose?: () => void
}

export function EditorOutline({ activePosition, closeLabel, drawer, emptyLabel, headings, label, onClose, onSelect }: EditorOutlineProps) {
  const scrollBodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activePosition === null) return
    const scrollBody = scrollBodyRef.current
    const activeItem = scrollBody?.querySelector<HTMLElement>('[aria-current="location"]')
    if (!scrollBody || !activeItem) return

    const outlineRect = scrollBody.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()
    if (itemRect.top < outlineRect.top || itemRect.bottom > outlineRect.bottom) {
      // Do not call Element#scrollIntoView here. The drawer is portalled into
      // the document-stage, which is also scrollable; browsers may then scroll
      // both the outline and the article. Moving only this inner scroll body
      // keeps the active item visible without changing document position.
      const offset = itemRect.top < outlineRect.top
        ? itemRect.top - outlineRect.top
        : itemRect.bottom - outlineRect.bottom
      const top = Math.max(0, scrollBody.scrollTop + offset)
      if (typeof scrollBody.scrollTo === 'function') {
        scrollBody.scrollTo({ top, behavior: 'auto' })
      } else {
        scrollBody.scrollTop = top
      }
    }
  }, [activePosition])

  return (
    <nav className={`editor-outline${drawer ? ' editor-outline--drawer' : ''}`} aria-label={label} id={drawer ? 'outline-drawer' : undefined}>
      <div className="editor-outline__header">
        <ListTree aria-hidden="true" />
        <span>{label}</span>
        {drawer ? <button aria-label={closeLabel} className="editor-outline__close" type="button" onClick={onClose}><X aria-hidden="true" size={16} /></button> : null}
      </div>
      <div ref={scrollBodyRef} className="editor-outline__body">
        {headings.length > 0 ? (
          <ol>
            {headings.map((heading) => (
              <li key={heading.key}>
                <button
                  aria-current={heading.pos === activePosition ? 'location' : undefined}
                  className={`editor-outline__item editor-outline__item--level-${Math.min(Math.max(heading.level, 1), 6)}${heading.pos === activePosition ? ' editor-outline__item--active' : ''}`}
                  data-heading-id={heading.id}
                  data-heading-key={heading.key}
                  data-heading-pos={heading.pos}
                  title={heading.text}
                  type="button"
                  onClick={() => onSelect(heading)}
                >
                  <span>{heading.text}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>{emptyLabel}</p>
        )}
      </div>
    </nav>
  )
}

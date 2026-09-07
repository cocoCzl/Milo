import { ListTree } from 'lucide-react'

export type EditorHeading = {
  level: number
  position: number
  text: string
}

type EditorOutlineProps = {
  emptyLabel: string
  headings: EditorHeading[]
  label: string
  onSelect: (heading: EditorHeading) => void
}

export function EditorOutline({ emptyLabel, headings, label, onSelect }: EditorOutlineProps) {
  return (
    <nav className="editor-outline" aria-label={label}>
      <div className="editor-outline__header">
        <ListTree aria-hidden="true" />
        <span>{label}</span>
      </div>
      {headings.length > 0 ? (
        <ol>
          {headings.map((heading) => (
            <li key={`${heading.position}:${heading.text}`}>
              <button
                className={`editor-outline__item editor-outline__item--level-${Math.min(heading.level, 3)}`}
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
    </nav>
  )
}

import { ChevronRight, ListTree, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Select } from '../../components/Select'

export type EditorHeading = {
  id: string
  key: string
  level: number
  pos: number
  text: string
}

export type OutlinePreferences = { depth: number; collapsed: ReadonlySet<string> }
type EditorOutlineProps = {
  preferences?: OutlinePreferences
  onPreferencesChange?: (preferences: OutlinePreferences) => void
  depthLabel?: string
  depthOptionLabel?: (depth: number) => string
  portalContainer?: HTMLElement | null
  collapseLabel?: string
  expandLabel?: string
  emptyLabel: string
  activePosition: number | null
  closeLabel: string
  drawer: boolean
  headings: EditorHeading[]
  label: string
  onSelect: (heading: EditorHeading) => void
  onClose?: () => void
}

export function EditorOutline({
  preferences = { depth: 3, collapsed: new Set() },
  onPreferencesChange,
  depthLabel = 'Heading levels',
  depthOptionLabel = (depth) => (depth === 1 ? 'Only H1' : `Show to H${depth}`),
  portalContainer,
  collapseLabel = 'Collapse section',
  expandLabel = 'Expand section',
  activePosition,
  closeLabel,
  drawer,
  emptyLabel,
  headings,
  label,
  onClose,
  onSelect,
}: EditorOutlineProps) {
  const ancestors: string[] = []
  const parents = new Map<string, string[]>()
  const levels = new Map(headings.map((heading) => [heading.key, heading.level]))
  const branches = new Set<string>()
  for (const heading of headings) {
    while (ancestors.length && levels.get(ancestors.at(-1)!)! >= heading.level) ancestors.pop()
    parents.set(heading.key, [...ancestors])
    if (ancestors.length) branches.add(ancestors.at(-1)!)
    ancestors.push(heading.key)
  }
  const activeKey = headings.find((heading) => heading.pos === activePosition)?.key
  const activeParents = new Set(activeKey ? parents.get(activeKey) : [])
  const visible = headings.filter(
    (heading) =>
      heading.level <= preferences.depth &&
      !parents.get(heading.key)?.some((key) => preferences.collapsed.has(key)),
  )
  const scrollBodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activePosition === null) return
    const scrollBody = scrollBodyRef.current
    const activeItem = scrollBody?.querySelector<HTMLElement>('[aria-current="location"]')
    if (!scrollBody || !activeItem) return

    const outlineRect = scrollBody.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()
    if (itemRect.top < outlineRect.top || itemRect.bottom > outlineRect.bottom) {
      // Do not call Element#scrollIntoView here: it can reveal multiple
      // ancestors, including the page. Moving only this inner scroll body
      // keeps the active item visible without changing document position.
      const offset =
        itemRect.top < outlineRect.top
          ? itemRect.top - outlineRect.top
          : itemRect.bottom - outlineRect.bottom
      const top = Math.max(0, scrollBody.scrollTop + offset)
      // Match document navigation: dictionary-form scrollTo can no-op in
      // WKWebView after a navigation button takes focus.
      scrollBody.scrollTop = top
    }
  }, [activePosition])

  return (
    <nav
      className={`editor-outline${drawer ? ' editor-outline--drawer' : ''}`}
      aria-label={label}
      id={drawer ? 'outline-drawer' : undefined}
    >
      <div className="editor-outline__header">
        <ListTree aria-hidden="true" />
        <span>{label}</span>
        {onPreferencesChange ? (
          <Select
            aria-label={depthLabel}
            options={[1, 2, 3, 4, 5, 6].map((depth) => ({
              label: depthOptionLabel(depth),
              value: String(depth),
            }))}
            portalContainer={portalContainer}
            value={String(preferences.depth)}
            variant="outline"
            onValueChange={(value) => onPreferencesChange({ ...preferences, depth: Number(value) })}
          />
        ) : null}
        {onClose ? (
          <button
            tabIndex={0}
            aria-label={closeLabel}
            className="editor-outline__close"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} />
          </button>
        ) : null}
      </div>
      <div ref={scrollBodyRef} className="editor-outline__body">
        {headings.length > 0 ? (
          <ol>
            {visible.map((heading) => (
              <li
                key={heading.key}
                className={`editor-outline__row editor-outline__row--level-${Math.min(Math.max(heading.level, 1), 6)}${activeParents.has(heading.key) ? ' editor-outline__ancestor' : ''}`}
              >
                {branches.has(heading.key) && onPreferencesChange ? (
                  <button
                    tabIndex={0}
                    className="editor-outline__fold"
                    type="button"
                    aria-label={`${preferences.collapsed.has(heading.key) ? expandLabel : collapseLabel}: ${heading.text}`}
                    aria-expanded={!preferences.collapsed.has(heading.key)}
                    onClick={() => {
                      const collapsed = new Set(preferences.collapsed)
                      if (collapsed.has(heading.key)) collapsed.delete(heading.key)
                      else collapsed.add(heading.key)
                      onPreferencesChange({ ...preferences, collapsed })
                    }}
                  >
                    <ChevronRight aria-hidden="true" size={12} />
                  </button>
                ) : null}
                <button
                  // WebKit's macOS default Tab policy skips native buttons
                  // unless their keyboard focusability is explicit.
                  tabIndex={0}
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

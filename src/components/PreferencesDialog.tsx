import * as Dialog from '@radix-ui/react-dialog'
import { Minus, Plus, X } from 'lucide-react'
import { useRef, type CSSProperties, type RefObject } from 'react'

import type { AppearancePreference, InterfaceLocale, ResolvedTheme } from '../settings/applicationSettings'
import { Select } from './Select'

type PreferencesDialogCopy = {
  appearance: string
  appearanceSection: string
  close: string
  dark: string
  displaySection: string
  documentSize: string
  interfaceSize: string
  language: string
  light: string
  system: string
  title: string
  warm: string
  decreaseInterfaceSize: string
  decreaseDocumentSize: string
  increaseInterfaceSize: string
  increaseDocumentSize: string
}

type PreferencesDialogProps = {
  appearance: AppearancePreference
  copy: PreferencesDialogCopy
  documentZoom: number
  error: string | null
  interfaceZoom: number
  locale: InterfaceLocale
  onAppearanceChange: (appearance: AppearancePreference) => void
  onDocumentZoomChange: (zoom: number) => void
  onInterfaceZoomChange: (zoom: number) => void
  onLocaleChange: (locale: InterfaceLocale) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  portalContainer: HTMLElement | null
  returnFocusRef: RefObject<HTMLElement | null>
  theme: ResolvedTheme
}

export function PreferencesDialog({ appearance, copy, documentZoom, error, interfaceZoom, locale, onAppearanceChange, onDocumentZoomChange, onInterfaceZoomChange, onLocaleChange, onOpenChange, open, portalContainer, returnFocusRef, theme }: PreferencesDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const portalStyle = {
    '--ui-font-lg': `${Number((13 * (interfaceZoom / 100)).toFixed(2))}px`,
    '--ui-font-md': `${Number((12 * (interfaceZoom / 100)).toFixed(2))}px`,
    '--ui-font-sm': `${Number((11 * (interfaceZoom / 100)).toFixed(2))}px`,
    '--ui-font-xs': `${Number((10 * (interfaceZoom / 100)).toFixed(2))}px`,
  } as CSSProperties

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <div className="preferences-dialog__portal dialog-overlay-layer" data-theme={theme} style={portalStyle}>
          <Dialog.Overlay className="preferences-dialog__backdrop" onClick={() => onOpenChange(false)} />
          <Dialog.Content
            className="preferences-dialog"
            aria-describedby={undefined}
            aria-modal="true"
            onEscapeKeyDown={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              queueMicrotask(() => returnFocusRef.current?.focus())
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              closeRef.current?.focus()
            }}
          >
          <header className="preferences-dialog__header">
            <Dialog.Title>{copy.title}</Dialog.Title>
            <Dialog.Close ref={closeRef} className="preferences-dialog__close" aria-label={copy.close}>
              <X aria-hidden="true" size={16} strokeWidth={1.8} />
            </Dialog.Close>
          </header>
          <div className="preferences-dialog__body">
            <section className="preferences-dialog__section" aria-labelledby="preferences-appearance-heading">
              <h3 id="preferences-appearance-heading">{copy.appearanceSection}</h3>
              <div className="preferences-dialog__rows">
                <label className="preferences-dialog__row">
                  <span>{copy.appearance}</span>
                  <Select
                    aria-label={copy.appearance}
                    options={[
                      { label: copy.system, value: 'system' },
                      { label: copy.light, value: 'light' },
                      { label: copy.dark, value: 'dark' },
                      { label: copy.warm, value: 'warm' },
                    ]}
                    portalContainer={portalContainer}
                    value={appearance}
                    onValueChange={(value) => onAppearanceChange(value as AppearancePreference)}
                  />
                </label>
                <label className="preferences-dialog__row">
                  <span>{copy.language}</span>
                  <Select
                    aria-label={copy.language}
                    options={[
                      { label: copy.system, value: 'system' },
                      { label: 'English', value: 'en' },
                      { label: '简体中文', value: 'zh-CN' },
                    ]}
                    portalContainer={portalContainer}
                    value={locale}
                    onValueChange={(value) => onLocaleChange(value as InterfaceLocale)}
                  />
                </label>
              </div>
            </section>
            <section className="preferences-dialog__section" aria-labelledby="preferences-display-heading">
              <h3 id="preferences-display-heading">{copy.displaySection}</h3>
              <div className="preferences-dialog__rows">
                <ZoomPreference
                  decreaseLabel={copy.decreaseInterfaceSize}
                  increaseLabel={copy.increaseInterfaceSize}
                  label={copy.interfaceSize}
                  onChange={onInterfaceZoomChange}
                  value={interfaceZoom}
                />
                <ZoomPreference
                  decreaseLabel={copy.decreaseDocumentSize}
                  increaseLabel={copy.increaseDocumentSize}
                  label={copy.documentSize}
                  onChange={onDocumentZoomChange}
                  value={documentZoom}
                />
              </div>
            </section>
            <footer className="preferences-dialog__footer">
              <span className="preferences-dialog__shortcut">⌘+ · ⌘− · ⌘0</span>
              {error ? <span className="preferences-dialog__error" role="status">{error}</span> : null}
            </footer>
          </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ZoomPreference({ decreaseLabel, increaseLabel, label, onChange, value }: { decreaseLabel: string; increaseLabel: string; label: string; onChange: (value: number) => void; value: number }) {
  return (
    <div className="preferences-dialog__row preferences-dialog__zoom">
      <span>{label}</span>
      <div>
        <button type="button" aria-label={decreaseLabel} onClick={() => onChange(value - 10)}>
          <Minus aria-hidden="true" size={13} strokeWidth={1.8} />
        </button>
        <output aria-label={label}>{value}%</output>
        <button type="button" aria-label={increaseLabel} onClick={() => onChange(value + 10)}>
          <Plus aria-hidden="true" size={13} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}

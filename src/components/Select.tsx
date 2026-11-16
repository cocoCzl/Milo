import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

export type SelectOption = {
  label: string
  value: string
}

type SelectProps = {
  'aria-label': string
  options: SelectOption[]
  portalContainer?: HTMLElement | null
  value: string
  variant?: 'outline'
  onValueChange: (value: string) => void
}

export function Select({
  'aria-label': ariaLabel,
  onValueChange,
  options,
  portalContainer,
  value,
  variant,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={`milo-select__trigger${variant ? ` milo-select__trigger--${variant}` : ''}`}
        tabIndex={variant === 'outline' ? 0 : undefined}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className="milo-select__icon">
          <ChevronDown aria-hidden="true" size={14} strokeWidth={1.8} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={portalContainer ?? undefined}>
        <SelectPrimitive.Content
          aria-label={variant === 'outline' ? ariaLabel : undefined}
          className={`milo-select__content${variant ? ` milo-select__content--${variant}` : ''}`}
          collisionPadding={10}
          position="popper"
          sideOffset={5}
          onEscapeKeyDown={variant === 'outline' ? (event) => event.stopPropagation() : undefined}
        >
          <SelectPrimitive.Viewport className="milo-select__viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                className="milo-select__item"
                value={option.value}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="milo-select__indicator">
                  <Check aria-hidden="true" size={14} strokeWidth={2} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

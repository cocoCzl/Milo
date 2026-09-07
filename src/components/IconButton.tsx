import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type IconButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string
  }
>

export function IconButton({ children, className, label, title, ...buttonProps }: IconButtonProps) {
  return (
    <span className="icon-button-shell">
      <button
        {...buttonProps}
        aria-label={label}
        className={`icon-button${className ? ` ${className}` : ''}`}
        type="button"
      >
        {children}
      </button>
      <span aria-hidden="true" className="icon-button__tooltip">{title ?? label}</span>
    </span>
  )
}

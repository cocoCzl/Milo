import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

import { Tooltip } from './Tooltip'

type IconButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string
  }
>

export function IconButton({ children, className, label, title, ...buttonProps }: IconButtonProps) {
  return (
    <span className="icon-button-shell">
      <Tooltip content={title ?? label} disabled={buttonProps['aria-expanded'] === true}>
        <button
          {...buttonProps}
          aria-label={label}
          className={`icon-button${className ? ` ${className}` : ''}`}
          type="button"
        >
          {children}
        </button>
      </Tooltip>
    </span>
  )
}

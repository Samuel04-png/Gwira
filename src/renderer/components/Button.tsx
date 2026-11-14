import React, { forwardRef } from 'react';
import { Icon, type IconName } from './Icon.js';
import './button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'compact' | 'default' | 'form';

type NativeButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export type ButtonProps = NativeButtonProps & (
  | { iconOnly: true; icon: IconName; 'aria-label': string; children?: never; trailingIcon?: never }
  | { iconOnly?: false; icon?: IconName; trailingIcon?: IconName; children: React.ReactNode }
);

/** Native button semantics; the caller owns submission, busy and toggle state. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'outline', size = 'default', type = 'button', className = '',
  iconOnly = false, icon, trailingIcon, children, ...props
}, ref) {
  const iconSize = size === 'form' ? 20 : 16;
  return <button {...props} ref={ref} type={type}
    className={`gw-button ${className}`.trim()} data-gw-button="" data-variant={variant}
    data-size={size} data-icon-only={iconOnly || undefined}>
    {icon ? <Icon name={icon} size={iconSize} className={`gw-button__icon${icon === 'running' ? ' gw-button__icon--running' : ''}`} /> : null}
    {!iconOnly ? <span className="gw-button__label">{children}</span> : null}
    {trailingIcon ? <Icon name={trailingIcon} size={iconSize} className="gw-button__icon" /> : null}
  </button>;
});

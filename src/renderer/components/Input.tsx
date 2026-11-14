import React, { forwardRef, useId } from 'react';
import './input.css';

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  type?: 'text' | 'search' | 'email' | 'password' | 'tel' | 'url' | 'number';
};

/** Keep native input semantics, values, validation, events and refs with the caller. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className = '', ...props }, ref) {
  return <input {...props} ref={ref} className={`gw-input ${className}`.trim()} data-gw-input="" />;
});

export type FieldProps = InputProps & {
  label: string;
  description?: string;
  error?: string;
};

/** Error text is supplied by the caller; this component does not run validation. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({
  label, description, error, id, 'aria-describedby': describedBy,
  'aria-invalid': invalid, ...props
}, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const descriptions = [describedBy, description ? descriptionId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return <div className="gw-field" data-gw-field="">
    <label className="gw-field__label" htmlFor={inputId}>{label}</label>
    <Input {...props} ref={ref} id={inputId} aria-describedby={descriptions} aria-invalid={error ? true : invalid} />
    {description ? <span className="gw-field__description" id={descriptionId}>{description}</span> : null}
    {error ? <span className="gw-field__error" id={errorId}>Error: {error}</span> : null}
  </div>;
});

import { cloneElement } from 'react';

/** Labeled form control with optional hint and validation feedback. */
export default function FormField({ label, id, error, hint, required, children }) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = cloneElement(children, {
    'aria-describedby': [...new Set([children.props['aria-describedby'], descriptionId].filter(Boolean))].join(' ') || undefined,
    'aria-invalid': error ? true : children.props['aria-invalid'],
    'aria-required': required ? true : children.props['aria-required'],
    required: required ? true : children.props.required,
  });
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}{required && <span aria-hidden="true"> *</span>}
      </label>
      {control}
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
      {!error && hint && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
}

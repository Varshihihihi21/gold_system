/** Accessible inline status panel for loading-independent errors and empty states. */
export default function Feedback({ kind = 'info', title, children, action }) {
  return (
    <div className={`feedback feedback-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div>
        {title && <strong>{title}</strong>}
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}

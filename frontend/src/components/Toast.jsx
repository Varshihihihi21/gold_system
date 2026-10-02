import { useEffect } from 'react';

/** Brief, screen-reader-announced feedback message. */
export default function Toast({ message, kind, onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live="polite">
      <span>{message}</span>
      <button type="button" className="toast-close" onClick={onClose} aria-label="Dismiss notification">×</button>
    </div>
  );
}

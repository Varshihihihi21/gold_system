import { useState } from 'react';
import Feedback from '../components/Feedback.jsx';

/** Device authentication screen for the terminal login endpoint. */
export default function LoginPage({ onAuthenticate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onAuthenticate();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>GOLDLINE <small>SECURE TERMINAL</small></span>
        </div>
        <p className="eyebrow">DEVICE ACCESS</p>
        <h1 id="login-title">Connect this terminal</h1>
        <p className="login-copy">Sign in with this registered counter device to manage daily rates, customers, and payments.</p>
        <div className="device-callout">
          <span className="device-indicator" aria-hidden="true" />
          <span><strong>Terminal identity</strong><small>Configured device · token held for this page session</small></span>
        </div>
        {error && <Feedback kind="error" title="Could not connect">{error}</Feedback>}
        <form onSubmit={submit}>
          <button className="button button-primary button-wide" type="submit" disabled={loading}>
            {loading ? 'Connecting…' : 'Authenticate terminal'}
          </button>
        </form>
        <p className="login-footnote">Access is limited to devices registered and enabled by your system administrator.</p>
      </section>
    </main>
  );
}

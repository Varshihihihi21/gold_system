import { useState } from 'react';
import Feedback from '../components/Feedback.jsx';
import FormField from '../components/FormField.jsx';

/** Device authentication screen for the terminal login endpoint. */
export default function LoginPage({ onAuthenticate, deviceInfo, deviceError }) {
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
          <span className="brand-mark" aria-hidden="true">K</span>
          <span>KALASH GOLD <small>SECURE TERMINAL</small></span>
        </div>
        <p className="eyebrow">DEVICE ACCESS</p>
        <h1 id="login-title">Connect this terminal</h1>
        <p className="login-copy">Sign in with this registered counter device to manage rates, customers, billing, stock, and cash.</p>
        <div className="device-callout">
          <span className="device-indicator" aria-hidden="true" />
          <span><strong>Terminal identity</strong><small>Device key protected by the operating system</small></span>
        </div>
        {deviceError && <Feedback kind="error" title="Desktop security unavailable">{deviceError}</Feedback>}
        {deviceInfo && (
          <details className="device-provisioning">
            <summary>Show device details for administrator provisioning</summary>
            <p>Register this device GUID and public key in the authorised_devices table. The private key never leaves this terminal.</p>
            <FormField id="device-guid" label="Device GUID">
              <input id="device-guid" readOnly value={deviceInfo.deviceGuid} />
            </FormField>
            <FormField id="device-public-key" label="Ed25519 public key">
              <textarea id="device-public-key" readOnly rows="5" value={deviceInfo.publicKey} />
            </FormField>
          </details>
        )}
        {error && <Feedback kind="error" title="Could not connect">{error}</Feedback>}
        <form onSubmit={submit}>
          <button className="button button-primary button-wide" type="submit" disabled={loading || !deviceInfo}>
            {loading ? 'Connecting…' : 'Authenticate terminal'}
          </button>
        </form>
        <p className="login-footnote">Access is limited to devices registered and enabled by your system administrator.</p>
      </section>
    </main>
  );
}

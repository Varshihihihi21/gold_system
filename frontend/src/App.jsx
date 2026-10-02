import { useCallback, useState } from 'react';
import AppShell from './components/AppShell.jsx';
import Toast from './components/Toast.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RatesPage from './pages/RatesPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import { DEVICE_GUID, apiRequest } from './api.js';
import './App.css';
import './pages.css';

/** Main terminal application with an in-memory device session and API-backed views. */
export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState('rates');
  const [toast, setToast] = useState(null);
  const notify = (message, kind = 'success') => setToast({ message, kind, key: Date.now() });

  async function authenticate() {
    const result = await apiRequest('/api/auth/device-login', {
      method: 'POST',
      body: JSON.stringify({ device_guid: DEVICE_GUID }),
    });
    if (typeof result?.token !== 'string' || typeof result?.device_name !== 'string') {
      throw new Error('The server did not return a valid device session. Contact your system administrator.');
    }
    setSession({ token: result.token, deviceName: result.device_name });
    setPage('rates');
    notify(`Terminal connected: ${result.device_name}`);
  }

  function signOut() {
    setSession(null);
    setPage('rates');
    setToast(null);
  }

  const handleAuthFailure = useCallback((status) => {
    setSession(null);
    setPage('rates');
    const message = status === 401
      ? 'Your terminal session expired. Authenticate again to continue.'
      : 'This terminal is no longer authorized. Contact your system administrator.';
    setToast({ message, kind: 'error', key: Date.now() });
  }, []);

  const protectedProps = { token: session?.token, deviceGuid: DEVICE_GUID, notify, onAuthFailure: handleAuthFailure };
  let content = null;
  if (session && page === 'rates') content = <RatesPage {...protectedProps} />;
  if (session && page === 'customers') content = <CustomersPage {...protectedProps} />;
  if (session && page === 'payments') content = <PaymentsPage {...protectedProps} />;

  return (
    <>
      {session ? (
        <AppShell page={page} setPage={setPage} deviceName={session.deviceName} onSignOut={signOut}>
          {content}
        </AppShell>
      ) : (
        <LoginPage onAuthenticate={authenticate} />
      )}
      {toast && <Toast key={toast.key} message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </>
  );
}

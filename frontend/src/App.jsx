import { useCallback, useEffect, useState } from 'react';
import AppShell from './components/AppShell.jsx';
import Toast from './components/Toast.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RatesPage from './pages/RatesPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import SalesPage from './pages/SalesPage.jsx';
import PurchasesPage from './pages/PurchasesPage.jsx';
import ExpensesPage from './pages/ExpensesPage.jsx';
import LogbookPage from './pages/LogbookPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import { apiRequest } from './api.js';
import './App.css';
import './pages.css';
import './finance.css';

/** Main terminal application with an in-memory device session and API-backed views. */
export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState('rates');
  const [toast, setToast] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [deviceError, setDeviceError] = useState('');
  const notify = useCallback((message, kind = 'success') => {
    setToast({ message, kind, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!window.goldline) {
      setDeviceError('Open this terminal in the installed desktop application to authenticate securely.');
      return;
    }
    window.goldline.getDeviceIdentity()
      .then(setDeviceInfo)
      .catch((error) => setDeviceError(error.message));
  }, []);

  async function authenticate() {
    if (!window.goldline || !deviceInfo?.deviceGuid) {
      throw new Error(deviceError || 'This terminal is not configured for secure device authentication.');
    }
    const challenge = await apiRequest('/api/auth/device-challenge', {
      method: 'POST',
      body: JSON.stringify({ device_guid: deviceInfo.deviceGuid }),
    });
    if (typeof challenge?.challengeId !== 'string' || typeof challenge?.challenge !== 'string') {
      throw new Error('The server returned an invalid device challenge.');
    }
    const signature = await window.goldline.signChallenge(challenge.challenge);
    const result = await apiRequest('/api/auth/device-login', {
      method: 'POST',
      body: JSON.stringify({
        device_guid: deviceInfo.deviceGuid,
        challenge_id: challenge.challengeId,
        signature,
      }),
    });
    if (typeof result?.token !== 'string' || typeof result?.device_name !== 'string'
        || result.device_guid !== deviceInfo.deviceGuid) {
      throw new Error('The server did not return a valid device session. Contact your system administrator.');
    }
    setSession({
      token: result.token,
      deviceGuid: deviceInfo.deviceGuid,
      deviceName: result.device_name,
      role: result.role,
    });
    setPage('rates');
    notify(`Terminal connected: ${result.device_name}`);
  }

  async function signOut() {
    setSession(null);
    setPage('rates');
    setToast(null);
    if (window.goldline) {
      try {
        await window.goldline.clearTransientData();
      } catch (error) {
        console.error('Could not clear transient terminal data:', error.message);
        setToast({ message: 'The session ended, but transient browser data could not be cleared.', kind: 'error', key: Date.now() });
      }
    }
  }

  const handleTokenRotated = useCallback((token) => {
    setSession((current) => current ? { ...current, token } : current);
  }, []);

  const handleAuthFailure = useCallback((status) => {
    setSession(null);
    setPage('rates');
    if (window.goldline) {
      window.goldline.clearTransientData().catch((error) => {
        console.error('Could not clear transient terminal data:', error.message);
      });
    }
    const message = status === 401
      ? 'Your terminal session expired. Authenticate again to continue.'
      : 'This terminal is no longer authorized. Contact your system administrator.';
    setToast({ message, kind: 'error', key: Date.now() });
  }, []);

  const protectedProps = {
    token: session?.token,
    deviceGuid: session?.deviceGuid,
    role: session?.role,
    notify,
    onAuthFailure: handleAuthFailure,
    onTokenRotated: handleTokenRotated,
  };
  let content = null;
  if (session && page === 'rates') content = <RatesPage {...protectedProps} />;
  if (session && page === 'customers') content = <CustomersPage {...protectedProps} />;
  if (session && page === 'payments') content = <PaymentsPage {...protectedProps} />;
  if (session && page === 'sales') content = <SalesPage {...protectedProps} />;
  if (session && page === 'purchases') content = <PurchasesPage {...protectedProps} />;
  if (session && page === 'expenses') content = <ExpensesPage {...protectedProps} />;
  if (session && page === 'logbook') content = <LogbookPage {...protectedProps} />;
  if (session && page === 'analytics') content = <AnalyticsPage {...protectedProps} />;

  return (
    <>
      {session ? (
        <AppShell page={page} setPage={setPage} deviceName={session.deviceName} onSignOut={signOut}>
          {content}
        </AppShell>
      ) : (
        <LoginPage
          onAuthenticate={authenticate}
          deviceInfo={deviceInfo}
          deviceError={deviceError}
        />
      )}
      {toast && <Toast key={toast.key} message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </>
  );
}

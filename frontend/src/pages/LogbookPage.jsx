import { useCallback, useEffect, useState } from 'react';
import Feedback from '../components/Feedback.jsx';
import FormField from '../components/FormField.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { apiRequest } from '../api.js';

/** Show live daily cash totals and close the drawer after physical reconciliation. */
export default function LogbookPage({ token, deviceGuid, role, notify, onAuthFailure, onTokenRotated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [physical, setPhysical] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError('');
    try {
      setData(await apiRequest('/api/logbook/today', { token, deviceGuid, onAuthFailure, onTokenRotated }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [token, deviceGuid, onAuthFailure, onTokenRotated]);
  useEffect(() => { reload(); }, [reload]);

  async function closeDay(event) {
    event.preventDefault();
    if (!window.confirm('Close today’s logbook? This locks the date against further cash entries.')) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest('/api/logbook/close', {
        method: 'POST', token, deviceGuid, onAuthFailure, onTokenRotated,
        body: JSON.stringify({ actual_physical_cash: physical }),
      });
      setData((current) => ({ ...current, summary: result.summary }));
      notify(`Day closed · variance ₹${result.summary.cash_variance}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const summary = data?.summary;
  return (
    <section className="page-view" aria-labelledby="logbook-title">
      <div className="page-heading"><div><p className="eyebrow">CASH CONTROL / DAILY CLOSE</p><h1 id="logbook-title">Cash logbook</h1>
        <p>Drawer totals include cash movements only; digital methods are excluded.</p></div>
        <button className="button button-secondary" type="button" onClick={reload}>Refresh</button></div>
      {error && <Feedback kind="error" title="Logbook unavailable">{error}</Feedback>}
      {loading ? <section className="surface-card"><Skeleton rows={4} /></section> : summary && (
        <>
          <section className="cash-summary" aria-label="Cash summary">
            <Metric label="Opening cash" value={summary.opening_balance} />
            <Metric label="Cash inflows" value={summary.total_inflows} />
            <Metric label="Cash outflows" value={summary.total_outflows} />
            <Metric label="Calculated close" value={summary.calculated_closing_balance} />
            {summary.is_closed && <Metric label="Variance" value={summary.cash_variance} />}
          </section>
          <section className="surface-card">
            <h2>Today’s entries</h2>
            {data.entries.length === 0 ? <Feedback kind="info" title="No cash movements yet">Cash transactions will appear here after they post.</Feedback> : (
              <ul className="logbook-list">{data.entries.map((entry) => (
                <li key={entry.entry_id}><span><strong>{entry.description || entry.source_type}</strong>
                  <small>{entry.created_at} · {entry.payment_mode} · {entry.source_type}</small></span>
                  <b className={entry.entry_type === 'INFLOW' ? 'amount-in' : 'amount-out'}>
                    {entry.entry_type === 'INFLOW' ? '+' : '−'}₹{entry.amount}</b>
                </li>
              ))}</ul>
            )}
          </section>
          {!summary.is_closed && role === 'OWNER' ? (
            <form className="surface-card stacked-form" onSubmit={closeDay}>
              <h2>Reconcile and close</h2>
              <FormField id="physical-cash" label="Physical drawer count (₹)" required hint="Variance is physical count minus calculated close.">
                <input id="physical-cash" type="number" min="0" step="0.01" value={physical}
                  onChange={(event) => setPhysical(event.target.value)} required />
              </FormField>
              <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Closing day…' : 'Reconcile and close day'}</button>
            </form>
          ) : summary.is_closed ? (
            <Feedback kind="success" title="Day closed">Physical cash ₹{summary.actual_physical_cash} · Variance ₹{summary.cash_variance}</Feedback>
          ) : (
            <Feedback kind="info" title="Owner close required">An OWNER-authorized terminal must enter the physical drawer count and close this day.</Feedback>
          )}
        </>
      )}
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="cash-metric"><span>{label}</span><strong>₹{value}</strong></div>;
}

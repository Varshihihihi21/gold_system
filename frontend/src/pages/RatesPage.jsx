import { useEffect, useRef, useState } from 'react';
import Feedback from '../components/Feedback.jsx';
import FormField from '../components/FormField.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useDraftForm } from '../hooks/useDraftForm.js';
import { apiRequest } from '../api.js';
import { isValidTwoDecimalInput } from '../validation.js';

const initialRates = {
  rate_999_sell: '',
  rate_49_sell: '',
  rate_999_buy: '',
  rate_fine_gatti_buy: '',
};

const rateFields = [
  ['rate_999_sell', '999 sell rate'],
  ['rate_49_sell', '22K (49) sell rate'],
  ['rate_999_buy', '999 buy rate'],
  ['rate_fine_gatti_buy', 'Fine Gatti buy rate'],
];

/** Load and update the current date's gold rates through the existing API. */
export default function RatesPage({ token, deviceGuid, role, notify, onAuthFailure, onTokenRotated }) {
  const { values, setValues, reset, dirty } = useDraftForm(initialRates);
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedRates, setSavedRates] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [touched, setTouched] = useState({});

  useEffect(() => {
    let active = true;
    apiRequest('/api/gold-rates/today', {
      token: tokenRef.current,
      deviceGuid,
      onAuthFailure,
      onTokenRotated,
    })
      .then((row) => {
        if (!active) return;
        setSavedRates(row);
        if (row && !dirtyRef.current) {
          const current = Object.fromEntries(rateFields.map(([key]) => [key, String(row[key] ?? '')]));
          reset(current);
        }
      })
      .catch((error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deviceGuid, reset, dirtyRef, onAuthFailure, onTokenRotated]);

  useEffect(() => {
    if (!savedRates) return;
    let active = true;
    apiRequest(`/api/gold-rates/audit?date=${encodeURIComponent(savedRates.rate_date)}`, {
      token: tokenRef.current, deviceGuid, onAuthFailure, onTokenRotated,
    }).then((rows) => { if (active) setAuditHistory(rows); })
      .catch((error) => { if (active) notify(`Rate audit history could not be loaded: ${error.message}`, 'error'); });
    return () => { active = false; };
  }, [savedRates?.rate_date, deviceGuid, onAuthFailure, onTokenRotated, notify]);

  const fieldError = (key, value) => {
    if (!touched[key]) return '';
    if (!value.trim()) return 'Enter a rate.';
    if (!Number.isFinite(Number(value))) return 'Enter a valid number.';
    return isValidTwoDecimalInput(value) ? '' : 'Use no more than two decimal places.';
  };

  async function submit(event) {
    event.preventDefault();
    setTouched(Object.fromEntries(rateFields.map(([key]) => [key, true])));
    const invalid = rateFields.some(([key]) => !isValidTwoDecimalInput(values[key]));
    if (invalid) return;

    setSaving(true);
    try {
      const row = await apiRequest('/api/gold-rates', {
        method: 'POST',
        token: tokenRef.current,
        deviceGuid,
        onAuthFailure,
        onTokenRotated,
        body: JSON.stringify(Object.fromEntries(rateFields.map(([key]) => [key, values[key]]))),
      });
      setSavedRates(row);
      reset(Object.fromEntries(rateFields.map(([key]) => [key, String(row[key] ?? values[key])])));
      notify('Today’s gold rates were saved.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-view" aria-labelledby="rates-title">
      <div className="page-heading">
        <div><p className="eyebrow">MARKET DESK / DAILY PRICING</p><h1 id="rates-title">Gold rates</h1>
          <p>Maintain the four rates used at this counter for today.</p></div>
        <span className="date-chip">{savedRates?.rate_date || 'Today'}</span>
      </div>
      {loadError && <Feedback kind="error" title="Rates could not be loaded">{loadError}</Feedback>}
      {loading ? <section className="surface-card"><Skeleton rows={4} /></section> : (
        <section className="surface-card rates-card">
          {!loadError && !savedRates && <Feedback kind="info" title="No rates saved for today">Enter the rates below to create today’s first rate record.</Feedback>}
          {savedRates && <Feedback kind="success" title="Today’s rates are available">
            {role === 'OWNER' ? 'Changes to today’s rates require an audit record.' : 'Rates are locked after initial setup; ask an OWNER-authorized terminal to change them.'}
          </Feedback>}
          {savedRates && role !== 'OWNER' && <Feedback kind="warning" title="Owner authorization required">
            Only an OWNER-authorized terminal may change rates after today’s rates have been saved.
          </Feedback>}
          <form className="rates-form" onSubmit={submit} noValidate>
            <div className="rate-grid">
              {rateFields.map(([key, label], index) => {
                const error = fieldError(key, values[key]);
                return (
                  <FormField key={key} id={key} label={label} required error={error}
                    hint={index === 0 ? 'Enter the rate as provided by your market desk.' : undefined}>
                    <input id={key} type="number" inputMode="decimal" step="0.01" required value={values[key]}
                      aria-invalid={Boolean(error)} aria-describedby={error ? `${key}-error` : undefined}
                      onBlur={() => setTouched((current) => ({ ...current, [key]: true }))}
                      onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
                  </FormField>
                );
              })}
            </div>
            <div className="form-actions">
              <span className="draft-label">{dirty ? 'Unsaved changes · held in memory only' : 'Changes save only when submitted'}</span>
              <button className="button button-primary" type="submit"
                disabled={saving || loading || Boolean(savedRates && role !== 'OWNER')}>
                {saving ? 'Saving rates…' : 'Save today’s rates'}
              </button>
            </div>
          </form>
        </section>
      )}
      {auditHistory.length > 0 && <section className="surface-card">
        <h2>Today’s rate changes</h2>
        <div className="table-scroll"><table className="data-table">
          <caption className="sr-only">Audit log of today’s daily rate changes</caption>
          <thead><tr><th scope="col">Changed</th><th scope="col">Editor</th><th scope="col">999 sell</th><th scope="col">49 sell</th><th scope="col">999 buy</th><th scope="col">Gatti buy</th></tr></thead>
          <tbody>{auditHistory.map((entry) => <tr key={entry.audit_id}>
            <td>{new Date(entry.changed_at).toLocaleString()}</td>
            <td>{entry.device_name || entry.changed_by}</td>
            <td>{entry.old_rate_999_sell} → {entry.new_rate_999_sell}</td>
            <td>{entry.old_rate_49_sell} → {entry.new_rate_49_sell}</td>
            <td>{entry.old_rate_999_buy} → {entry.new_rate_999_buy}</td>
            <td>{entry.old_rate_fine_gatti_buy} → {entry.new_rate_fine_gatti_buy}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}
    </section>
  );
}

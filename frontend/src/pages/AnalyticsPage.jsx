import { useEffect, useState } from 'react';
import Feedback from '../components/Feedback.jsx';
import FormField from '../components/FormField.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { apiRequest } from '../api.js';

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function periodRange(period, today) {
  const end = new Date(`${today}T12:00:00`);
  const start = new Date(end);
  if (period === 'weekly') {
    const weekday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekday);
  } else if (period === 'monthly') {
    start.setDate(1);
  }
  return { from: localDate(start), to: today };
}

/** Display weighted-average cost-basis profit analytics for a selected period. */
export default function AnalyticsPage({ token, deviceGuid, onAuthFailure, onTokenRotated }) {
  const today = localDate(new Date());
  const [period, setPeriod] = useState('daily');
  const [range, setRange] = useState(periodRange('daily', today));
  const [includeHousehold, setIncludeHousehold] = useState(true);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      include_household: String(includeHousehold),
    });
    apiRequest(`/api/analytics/profit?${params}`, { token, deviceGuid, onAuthFailure, onTokenRotated })
      .then((result) => { if (active) setReport(result); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, deviceGuid, range, includeHousehold, onAuthFailure, onTokenRotated]);

  function changePeriod(value) {
    setPeriod(value);
    if (value !== 'custom') setRange(periodRange(value, today));
  }

  return (
    <section className="page-view" aria-labelledby="analytics-title">
      <div className="page-heading"><div><p className="eyebrow">REPORTING / PERIOD PROFIT</p><h1 id="analytics-title">Profit analytics</h1>
        <p>Profit subtracts purchases recorded in the selected period, then office costs and optionally household withdrawals.</p></div></div>
      <section className="surface-card analytics-filters">
        <FormField id="analytics-period" label="Reporting period">
          <select id="analytics-period" value={period} onChange={(event) => changePeriod(event.target.value)}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option><option value="custom">Custom</option>
          </select>
        </FormField>
        {period === 'custom' && <>
          <FormField id="analytics-from" label="From date"><input id="analytics-from" type="date" value={range.from}
            onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} /></FormField>
          <FormField id="analytics-to" label="To date"><input id="analytics-to" type="date" value={range.to}
            onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} /></FormField>
        </>}
        <label className="checkbox-field"><input type="checkbox" checked={includeHousehold}
          onChange={(event) => setIncludeHousehold(event.target.checked)} /> Include household expenses in net retained profit</label>
      </section>
      {error && <Feedback kind="error" title="Analytics unavailable">{error}</Feedback>}
      {loading ? <section className="surface-card"><Skeleton rows={5} /></section> : report && (
        <>
          <section className="cash-summary analytics-summary" aria-label="Profit results">
            <Metric label="Sales revenue" value={report.sales_revenue} />
            <Metric label="Purchase costs" value={report.purchase_costs} />
            <Metric label="Gross profit" value={report.gross_profit ?? 'Incomplete'} />
            <Metric label="Office expenses" value={report.office_expenses} />
            <Metric label="Operating profit" value={report.operating_profit ?? 'Incomplete'} />
            <Metric label="Household expenses" value={report.household_expenses} />
            <Metric label="Net retained profit" value={report.net_retained_profit ?? 'Incomplete'} />
            <Metric label={`Daily average · ${report.period_days} calendar days`} value={report.daily_average_profit ?? '—'} />
          </section>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="cash-metric"><span>{label}</span><strong>{value === 'Incomplete' || value === '—' ? value : `₹${value}`}</strong></div>;
}

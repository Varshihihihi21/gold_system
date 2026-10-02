import { useEffect, useMemo, useState } from 'react';
import Feedback from '../components/Feedback.jsx';
import FinanceCustomerPicker from '../components/FinanceCustomerPicker.jsx';
import FormField from '../components/FormField.jsx';
import { apiRequest } from '../api.js';
import { previewSale } from '../financial-math.js';

const emptyLine = () => ({ category: '999', actual_weight_grams: '', entered_line_total: '' });
const moneyCents = (value) => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value || '').trim());
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0') : null;
};

/** Build an invoice using locked daily rates and backend price validation. */
export default function SalesPage({ token, deviceGuid, role, notify, onAuthFailure, onTokenRotated }) {
  const [rates, setRates] = useState(null);
  const [rateError, setRateError] = useState('');
  const [customer, setCustomer] = useState(null);
  const [items, setItems] = useState([emptyLine()]);
  const [cash, setCash] = useState('');
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    apiRequest('/api/gold-rates/today', { token, deviceGuid, onAuthFailure, onTokenRotated })
      .then(setRates).catch((requestError) => setRateError(requestError.message));
  }, [token, deviceGuid, onAuthFailure, onTokenRotated]);

  const previews = useMemo(() => items.map((item) => {
    if (!rates) return null;
    const key = item.category === '999' ? 'rate_999_sell' : 'rate_49_sell';
    return previewSale(item.category, item.actual_weight_grams, rates[key]);
  }), [items, rates]);
  const invoiceCents = items.reduce((sum, item, index) => {
    const price = moneyCents(item.entered_line_total || previews[index]?.lineTotal);
    return price === null ? sum : sum + price;
  }, 0n);

  function updateLine(index, field, value) {
    setItems((current) => current.map((item, line) => line === index ? { ...item, [field]: value } : item));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    if (!customer) return setError('Select a customer before creating the invoice.');
    if (!rates) return setError('Today’s gold rates must be available before billing.');
    const requestItems = items.map((item, index) => ({
      category: item.category,
      actual_weight_grams: item.actual_weight_grams,
      entered_line_total: item.entered_line_total || previews[index]?.lineTotal,
    }));
    if (requestItems.some((item) => !item.actual_weight_grams || !item.entered_line_total)) {
      return setError('Enter a valid weight and price for every line.');
    }
    setBusy(true);
    try {
      const response = await apiRequest('/api/sales/invoices', {
        method: 'POST', token, deviceGuid, onAuthFailure, onTokenRotated,
        body: JSON.stringify({
          customer_id: customer.customer_id,
          items: requestItems,
          cash_received: cash || '0.00',
          owner_override: override,
        }),
      });
      setResult(response);
      setItems([emptyLine()]);
      setCash('');
      setOverride(false);
      setCustomer(null);
      notify(`Invoice ${response.invoice.invoice_number} recorded.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-view" aria-labelledby="sales-title">
      <div className="page-heading"><div><p className="eyebrow">SALES / CUSTOMER LEDGER</p><h1 id="sales-title">Create invoice</h1>
        <p>Rates are injected from today’s saved schedule; inventory is costed by weighted average.</p></div></div>
      {rateError && <Feedback kind="error" title="Rates unavailable">{rateError}</Feedback>}
      {!rateError && !rates && <Feedback kind="info" title="Today’s rates required">Save daily rates before starting a sale.</Feedback>}
      {result && <Feedback kind="success" title="Invoice recorded">
        {result.invoice.invoice_number} · Previous balance ₹{result.previous_balance} · Bill ₹{result.invoice.total_amount}
        · Cash ₹{result.cash_paid_today} · Remaining debt ₹{result.updated_balance}
      </Feedback>}
      {error && <Feedback kind="error" title="Invoice not saved">{error}</Feedback>}
      <form className="surface-card stacked-form" onSubmit={submit}>
        <FinanceCustomerPicker {...{ token, deviceGuid, onAuthFailure, onTokenRotated }} selected={customer} onSelect={setCustomer} />
        <div className="finance-lines">
          {items.map((item, index) => {
            const rate = rates?.[item.category === '999' ? 'rate_999_sell' : 'rate_49_sell'];
            const preview = previews[index];
            const entered = item.entered_line_total || preview?.lineTotal || '';
            const mismatch = preview && moneyCents(entered) !== null
              && (moneyCents(entered) - moneyCents(preview.lineTotal) > 1n
                || moneyCents(preview.lineTotal) - moneyCents(entered) > 1n);
            return (
              <fieldset className="finance-line" key={index}>
                <legend>Gold item {index + 1}</legend>
                <FormField id={`sale-category-${index}`} label="Category">
                  <select id={`sale-category-${index}`} value={item.category} onChange={(event) => updateLine(index, 'category', event.target.value)}>
                    <option value="999">999 gold</option><option value="49">49 gold</option>
                  </select>
                </FormField>
                <FormField id={`sale-weight-${index}`} label="Actual weight (g)">
                  <input id={`sale-weight-${index}`} type="number" step="0.0001" min="0.0001" value={item.actual_weight_grams}
                    onChange={(event) => updateLine(index, 'actual_weight_grams', event.target.value)} required />
                </FormField>
                <p className="field-hint">Rate ₹{rate || '—'}/g · Billed weight {preview?.billedWeight || '—'} g · Fine gold {preview?.fineWeight || '—'} g</p>
                <FormField id={`sale-price-${index}`} label="Line price (₹)" hint={`Calculated price: ₹${preview?.lineTotal || '—'}`}>
                  <input id={`sale-price-${index}`} type="number" step="0.01" min="0.01" value={entered}
                    onChange={(event) => updateLine(index, 'entered_line_total', event.target.value)} required />
                </FormField>
                {mismatch && <p className="field-error" role="alert">Expected ₹{preview.lineTotal}. Verify the weight; only an OWNER terminal can override.</p>}
                {items.length > 1 && <button className="button button-quiet" type="button"
                  onClick={() => setItems((current) => current.filter((_, line) => line !== index))}>Remove item {index + 1}</button>}
              </fieldset>
            );
          })}
        </div>
        <button className="button button-secondary" type="button" disabled={items.length >= 20}
          onClick={() => setItems((current) => [...current, emptyLine()])}>Add gold item</button>
        <p className="finance-total">Invoice total <strong>₹{(invoiceCents / 100n).toString()}.{String(invoiceCents % 100n).padStart(2, '0')}</strong></p>
        <FormField id="sale-cash" label="Cash received today (₹)" hint="Only cash received is posted to the physical cash logbook.">
          <input id="sale-cash" type="number" min="0" step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} required />
        </FormField>
        {role === 'OWNER' && <label className="checkbox-field"><input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
          Owner-authorized price override (audited)</label>}
        <div className="form-actions"><span className="draft-label">Pending amount adds to customer debt.</span>
          <button className="button button-primary" type="submit" disabled={busy || !rates}>{busy ? 'Saving invoice…' : 'Create invoice'}</button></div>
      </form>
    </section>
  );
}

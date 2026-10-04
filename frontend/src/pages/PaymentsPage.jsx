import { useState } from 'react';
import Feedback from '../components/Feedback.jsx';
import FormField from '../components/FormField.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useCustomerSearch } from '../hooks/useCustomerSearch.js';
import { useDraftForm } from '../hooks/useDraftForm.js';
import { apiRequest } from '../api.js';
import { isValidTwoDecimalInput } from '../validation.js';

const initialPayment = { amount_paid: '', payment_mode: 'CASH', notes: '' };

/** Find a customer and record a debt payment using the transactional API endpoint. */
export default function PaymentsPage({ token, deviceGuid, notify, onAuthFailure, onTokenRotated }) {
  const draft = useDraftForm(initialPayment);
  const search = useCustomerSearch(token, deviceGuid, onAuthFailure, onTokenRotated);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState('');
  const [printError, setPrintError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const amountError = touched && !draft.values.amount_paid.trim()
    ? 'Enter an amount.'
    : touched && !Number.isFinite(Number(draft.values.amount_paid)) ? 'Enter a valid amount.'
      : touched && !isValidTwoDecimalInput(draft.values.amount_paid) ? 'Use no more than two decimal places.' : '';

  async function submit(event) {
    event.preventDefault();
    setTouched(true);
    if (!selected || !isValidTwoDecimalInput(draft.values.amount_paid)) return;
    setSaving(true);
    setFormError('');
    setReceipt(null);
    try {
      const result = await apiRequest('/api/payments', {
        method: 'POST',
        token,
        deviceGuid,
        onAuthFailure,
        onTokenRotated,
        body: JSON.stringify({
          customer_id: selected.customer_id,
          amount_paid: draft.values.amount_paid,
          payment_mode: draft.values.payment_mode,
          notes: draft.values.notes.trim(),
        }),
      });
      setReceipt(result);
      draft.reset(initialPayment);
      setTouched(false);
      setSelected(null);
      search.setQuery('');
      notify(`Payment recorded · ${result.payment.receipt_number}`);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function printPaymentReceipt() {
    if (!window.goldline || !receipt) return;
    setPrintError('');
    try {
      await window.goldline.printReceipt({
        title: 'Customer debt payment',
        lines: [
          `Receipt: ${receipt.payment.receipt_number}`,
          `Customer ID: ${receipt.payment.customer_id}`,
          `Payment mode: ${receipt.payment.payment_mode}`,
          `Starting balance: ${receipt.previous_balance}`,
          `Amount paid: ${receipt.payment.amount_paid}`,
        ],
        total: `Remaining balance: ${receipt.updated_balance}`,
      });
    } catch (error) {
      setPrintError(error.message);
    }
  }

  return (
    <section className="page-view" aria-labelledby="payments-title">
      <div className="page-heading">
        <div><p className="eyebrow">CUSTOMER LEDGER / RECEIPTS</p><h1 id="payments-title">Record a payment</h1>
          <p>Apply a payment to the selected customer’s pending balance.</p></div>
        <span className="section-count">SECURE TRANSACTION</span>
      </div>
      {receipt && (
        <Feedback kind="success" title="Payment recorded">
          Receipt {receipt.payment.receipt_number} · Balance ₹{receipt.previous_balance} → ₹{receipt.updated_balance}
          <div className="form-actions">
            <button className="button button-secondary" type="button" onClick={printPaymentReceipt}>Print receipt</button>
          </div>
        </Feedback>
      )}
      {printError && <Feedback kind="error" title="Receipt could not be printed">{printError}</Feedback>}
      <div className="payment-layout">
        <section className="surface-card" aria-labelledby="select-customer-title">
          <div className="card-heading"><span className="card-index">01</span><div><h2 id="select-customer-title">Select customer</h2><p>Search by name or phone to load the account balance.</p></div></div>
          <FormField id="payment-search" label="Customer name, phone, or ID" hint="Search is debounced by 300 ms.">
            <input id="payment-search" type="search" inputMode="tel" autoComplete="off" value={search.query}
              onChange={(event) => { search.setQuery(event.target.value); setSelected(null); }} />
          </FormField>
          <div className="search-results" aria-live="polite">
            {search.status === 'idle' && !selected && <Feedback title="Choose an account">Search for the customer who is making this payment.</Feedback>}
            {search.status === 'loading' && <Skeleton rows={2} />}
            {search.status === 'error' && <Feedback kind="error" title="Search failed">{search.error}</Feedback>}
            {search.status === 'empty' && <Feedback title="No matching customers">Check the number or register the customer first.</Feedback>}
            {search.status === 'success' && (
              <ul className="customer-results">
                {search.rows.map((customer) => (
                  <li className="customer-result" key={customer.customer_id}>
                    <span className="customer-result-details"><strong>{customer.full_name}</strong><small>{customer.phone_number} · ID {customer.customer_id}</small></span>
                    <span className="balance-preview">₹{customer.pending_balance ?? '—'}<small>pending</small></span>
                    <button className="button button-secondary select-button" type="button"
                      aria-pressed={selected?.customer_id === customer.customer_id}
                      onClick={() => { setSelected(customer); setFormError(''); }}>Select</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selected && (
            <div className="selected-customer">
              <span className="selected-label">SELECTED ACCOUNT</span>
              <strong>{selected.full_name}</strong><span>{selected.phone_number}</span>
              <b>Current balance&nbsp; ₹{selected.pending_balance ?? '—'}</b>
            </div>
          )}
        </section>

        <section className="surface-card" aria-labelledby="payment-details-title">
          <div className="card-heading"><span className="card-index">02</span><div><h2 id="payment-details-title">Payment details</h2><p>Review the amount and payment method.</p></div></div>
          {formError && <Feedback kind="error" title="Payment was not recorded">{formError}</Feedback>}
          <form className="stacked-form" onSubmit={submit} noValidate>
            <FormField id="amount_paid" label="Amount paid (₹)" required error={amountError}>
              <input id="amount_paid" type="number" inputMode="decimal" step="0.01" required value={draft.values.amount_paid}
                aria-invalid={Boolean(amountError)} onBlur={() => setTouched(true)}
                onChange={(event) => { draft.setValues((current) => ({ ...current, amount_paid: event.target.value })); setFormError(''); }} />
            </FormField>
            <FormField id="payment_mode" label="Payment method" required>
              <select id="payment_mode" value={draft.values.payment_mode}
                onChange={(event) => draft.setValues((current) => ({ ...current, payment_mode: event.target.value }))}>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
              </select>
            </FormField>
            <FormField id="payment-notes" label="Note" hint="Optional receipt note.">
              <textarea id="payment-notes" rows="3" value={draft.values.notes}
                onChange={(event) => draft.setValues((current) => ({ ...current, notes: event.target.value }))} />
            </FormField>
            <div className="form-actions">
              <span className="draft-label">{draft.dirty ? 'Unsaved changes · held in memory only' : 'Select an account before recording'}</span>
              <button className="button button-primary" type="submit" disabled={saving || !selected}>
                {saving ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}

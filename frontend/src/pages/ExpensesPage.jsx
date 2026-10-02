import { useState } from 'react';
import Feedback from '../components/Feedback.jsx';
import FormField from '../components/FormField.jsx';
import { apiRequest } from '../api.js';

/** Record office or household expenses and display the resulting receipt. */
export default function ExpensesPage({ token, deviceGuid, notify, onAuthFailure, onTokenRotated }) {
  const [category, setCategory] = useState('OFFICE');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(null);
    try {
      const result = await apiRequest('/api/expenses', {
        method: 'POST', token, deviceGuid, onAuthFailure, onTokenRotated,
        body: JSON.stringify({ category, amount, payment_mode: paymentMode, description }),
      });
      setSaved(result.expense);
      setAmount('');
      setDescription('');
      notify(`${category} expense recorded.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-view" aria-labelledby="expenses-title">
      <div className="page-heading"><div><p className="eyebrow">CASH FLOW / WITHDRAWALS</p><h1 id="expenses-title">Record expense</h1>
        <p>Classify office operating costs separately from household owner draws.</p></div></div>
      {error && <Feedback kind="error" title="Expense not saved">{error}</Feedback>}
      {saved && <Feedback kind="success" title="Expense recorded">{saved.category} · ₹{saved.amount} · {saved.payment_mode}</Feedback>}
      <form className="surface-card stacked-form" onSubmit={submit}>
        <FormField id="expense-category" label="Expense category" required>
          <select id="expense-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="OFFICE">OFFICE — operating expense</option>
            <option value="HOUSEHOLD">HOUSEHOLD — owner cash draw</option>
          </select>
        </FormField>
        <FormField id="expense-amount" label="Amount (₹)" required>
          <input id="expense-amount" type="number" min="0.01" step="0.01" value={amount}
            onChange={(event) => setAmount(event.target.value)} required />
        </FormField>
        <FormField id="expense-mode" label="Payment mode" required>
          <select id="expense-mode" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
            <option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option>
            <option value="UPI">UPI</option><option value="CARD">Card</option>
          </select>
        </FormField>
        <FormField id="expense-description" label="Description" hint="Optional · up to 500 characters">
          <input id="expense-description" maxLength="500" value={description}
            onChange={(event) => setDescription(event.target.value)} />
        </FormField>
        <p className="field-hint">Only cash expenses reduce the physical drawer total.</p>
        <div className="form-actions"><span className="draft-label">Saved to the cloud on submit; draft remains in memory.</span>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving expense…' : 'Record expense'}</button></div>
      </form>
    </section>
  );
}

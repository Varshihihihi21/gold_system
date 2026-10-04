import { useEffect, useState } from 'react';
import Feedback from '../components/Feedback.jsx';
import FinanceCustomerPicker from '../components/FinanceCustomerPicker.jsx';
import FormField from '../components/FormField.jsx';
import { apiRequest } from '../api.js';
import { previewPurchase } from '../financial-math.js';

/** Record customer buybacks and initialize opening inventory for an owner. */
export default function PurchasesPage({ token, deviceGuid, notify, onAuthFailure, onTokenRotated }) {
  const [rates, setRates] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [category, setCategory] = useState('999');
  const [weight, setWeight] = useState('');
  const [touch, setTouch] = useState('');
  const [opening, setOpening] = useState({ physical: '', fine: '', cost: '' });
  const [ownerPin, setOwnerPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [voucher, setVoucher] = useState(null);
  const [voucherCustomer, setVoucherCustomer] = useState(null);
  const [printError, setPrintError] = useState('');
  const rate = rates?.[category === '999' ? 'rate_999_buy' : 'rate_fine_gatti_buy'];
  const preview = previewPurchase(category, weight, touch, rate);

  useEffect(() => {
    Promise.all([
      apiRequest('/api/gold-rates/today', { token, deviceGuid, onAuthFailure, onTokenRotated }),
      apiRequest('/api/inventory', { token, deviceGuid, onAuthFailure, onTokenRotated }),
    ]).then(([today, stock]) => { setRates(today); setInventory(stock); })
      .catch((requestError) => setError(requestError.message));
  }, [token, deviceGuid, onAuthFailure, onTokenRotated]);

  async function submitPurchase(event) {
    event.preventDefault();
    if (!customer) return setError('Select the customer selling gold.');
    setBusy(true);
    setError('');
    setPrintError('');
    try {
      const response = await apiRequest('/api/purchases', {
        method: 'POST', token, deviceGuid, onAuthFailure, onTokenRotated,
        body: JSON.stringify({
          customer_id: customer.customer_id, category, actual_weight_grams: weight,
          touch_percentage: category === 'GATTI' ? touch : undefined,
        }),
      });
      setVoucher(response.voucher);
      setVoucherCustomer(customer);
      setWeight('');
      setTouch('');
      setCustomer(null);
      notify(`Purchase voucher ${response.voucher.voucher_number} recorded.`);
      const stock = await apiRequest('/api/inventory', { token, deviceGuid, onAuthFailure, onTokenRotated });
      setInventory(stock);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function printVoucher() {
    if (!window.goldline || !voucher || !voucherCustomer) return;
    setPrintError('');
    try {
      await window.goldline.printReceipt({
        title: 'Kalash Gold purchase voucher',
        lines: [
          `Voucher: ${voucher.voucher_number}`,
          `Customer: ${voucherCustomer.full_name} · ${voucherCustomer.phone_number}`,
          `Category: ${voucher.category}`,
          `Actual weight: ${voucher.actual_weight_grams} g`,
          ...(voucher.touch_percentage === null ? [] : [`Touch: ${voucher.touch_percentage}%`]),
          `Fine weight: ${voucher.fine_weight_grams} g`,
          `Rate: ₹${voucher.applied_rate_per_gram}/g`,
        ],
        total: `Amount paid: ₹${voucher.total_payout_amount}`,
      });
    } catch (failure) {
      setPrintError(failure.message);
    }
  }

  async function configureOpening(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest('/api/inventory/opening', {
        method: 'POST', token, deviceGuid, onAuthFailure, onTokenRotated,
        body: JSON.stringify({
          physical_stock_grams: opening.physical,
          fine_stock_grams: opening.fine,
          inventory_cost_amount: opening.cost,
          owner_pin: ownerPin,
        }),
      });
      setInventory(response.inventory);
      setOwnerPin('');
      notify('Opening inventory configured.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-view" aria-labelledby="purchases-title">
      <div className="page-heading"><div><p className="eyebrow">BUYBACK / STOCK INTAKE</p><h1 id="purchases-title">Purchase gold</h1>
        <p>Record customer intake, payout, and fine-gold weighted-average inventory.</p></div></div>
      {error && <Feedback kind="error" title="Purchase action failed">{error}</Feedback>}
      {voucher && <Feedback kind="success" title="Purchase recorded">
        {voucher.voucher_number} · Paid ₹{voucher.total_payout_amount} · Fine weight {voucher.fine_weight_grams} g
        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={printVoucher}>Print purchase voucher</button>
        </div>
      </Feedback>}
      {printError && <Feedback kind="error" title="Voucher could not be printed">{printError}</Feedback>}
      <div className="inventory-summary">
        <span>Physical stock <strong>{inventory?.physical_stock_grams ?? '—'} g</strong></span>
        <span>Fine gold <strong>{inventory?.fine_stock_grams ?? '—'} g</strong></span>
        <span>Stock cost <strong>₹{inventory?.inventory_cost_amount ?? '—'}</strong></span>
      </div>
      {inventory && !inventory.opening_configured && !inventory.has_activity && (
        <details className="surface-card">
          <summary>Configure one-time opening inventory</summary>
          <p>Enter the verified physical weight, fine-gold equivalent, and total carrying cost. This cannot be changed after stock activity begins.</p>
          <form className="stacked-form" onSubmit={configureOpening}>
            {[
              ['physical', 'Physical stock (g)'],
              ['fine', 'Fine-gold stock (g)'],
              ['cost', 'Total inventory cost (₹)'],
            ].map(([key, label]) => (
              <FormField key={key} id={`opening-${key}`} label={label}>
                <input id={`opening-${key}`} type="number" min="0" step={key === 'cost' ? '0.01' : '0.0001'}
                  value={opening[key]} onChange={(event) => setOpening((current) => ({ ...current, [key]: event.target.value }))} required />
              </FormField>
            ))}
            <FormField id="opening-owner-pin" label="Owner PIN/password" required>
              <input id="opening-owner-pin" type="password" autoComplete="current-password" value={ownerPin}
                onChange={(event) => setOwnerPin(event.target.value)} required />
            </FormField>
            <button className="button button-secondary" type="submit" disabled={busy}>Save opening inventory</button>
          </form>
        </details>
      )}
      <form className="surface-card stacked-form" onSubmit={submitPurchase}>
        <FinanceCustomerPicker {...{ token, deviceGuid, onAuthFailure, onTokenRotated }} selected={customer} onSelect={setCustomer} />
        <FormField id="purchase-category" label="Gold category" required>
          <select id="purchase-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="999">999 gold</option><option value="GATTI">Gatti gold</option>
          </select>
        </FormField>
        <FormField id="purchase-weight" label="Actual weight (g)" required>
          <input id="purchase-weight" type="number" min="0.0001" step="0.0001" value={weight}
            onChange={(event) => setWeight(event.target.value)} required />
        </FormField>
        {category === 'GATTI' && <FormField id="purchase-touch" label="Touch (%)" hint="Enter purity from 0.01 to 100.00." required>
          <input id="purchase-touch" type="number" min="0.01" max="100" step="0.01" value={touch}
            onChange={(event) => setTouch(event.target.value)} required />
        </FormField>}
        <Feedback kind="info" title="Calculated cash payout">
          Rate ₹{rate || '—'}/g · Fine weight {preview?.fineWeight ?? '—'} g · Pay ₹{preview?.payout ?? '—'}
          <br />Purchase payout is posted as a cash outflow.
        </Feedback>
        <div className="form-actions"><span className="draft-label">Purchase will update inventory and logbook atomically.</span>
          <button className="button button-primary" type="submit" disabled={busy || !rates || !preview}>{busy ? 'Saving purchase…' : 'Create purchase voucher'}</button></div>
      </form>
    </section>
  );
}

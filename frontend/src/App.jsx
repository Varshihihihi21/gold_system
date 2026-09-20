import React, { useState } from 'react';

const HARDWARE_DEVICE_GUID = "HW-MAC-7F-88-99-00-11-22";

export default function App() {
  const [sessionToken, setSessionToken] = useState(null);
  const [rates, setRates] = useState({ rate_999_sell: '', rate_49_sell: '', rate_999_buy: '', rate_fine_gatti_buy: '' });
  const [customer, setCustomer] = useState({ full_name: '', phone_number: '', address: '' });
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [payment, setPayment] = useState({ customer_id: '', amount_paid: '', payment_mode: 'CASH', notes: '' });
  const [statusMsg, setStatusMsg] = useState('');

  const apiFetch = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'x-device-guid': HARDWARE_DEVICE_GUID,
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...options.headers,
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'API Request Failed');
    }
    return response.json();
  };

  const handleDeviceAuth = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/auth/device-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_guid: HARDWARE_DEVICE_GUID }),
      });
      const data = await res.json();
      if (res.ok) {
        setSessionToken(data.token);
        setStatusMsg(`Authenticated Device: ${data.device_name}`);
      } else {
        setStatusMsg(`Auth Failed: ${data.error}`);
      }
    } catch (err) {
      setStatusMsg(`Connection Error: ${err.message}`);
    }
  };

  const submitRates = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('http://localhost:4000/api/gold-rates', {
        method: 'POST',
        body: JSON.stringify(rates),
      });
      setStatusMsg('Gold Rates Updated Successfully');
    } catch (err) {
      setStatusMsg(`Rates Error: ${err.message}`);
    }
  };

  const createCustomer = async (e) => {
    e.preventDefault();
    try {
      const newCust = await apiFetch('http://localhost:4000/api/customers', {
        method: 'POST',
        body: JSON.stringify(customer),
      });
      setStatusMsg(`Customer Created: ID ${newCust.customer_id}`);
      setCustomer({ full_name: '', phone_number: '', address: '' });
    } catch (err) {
      setStatusMsg(`Customer Creation Error: ${err.message}`);
    }
  };

  const searchCustomers = async () => {
    try {
      const results = await apiFetch(`http://localhost:4000/api/customers/search?phone=${searchPhone}`);
      setSearchResults(results);
    } catch (err) {
      setStatusMsg(`Search Error: ${err.message}`);
    }
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('http://localhost:4000/api/payments', {
        method: 'POST',
        body: JSON.stringify(payment),
      });
      setStatusMsg(`Payment Processed! Receipt: ${res.payment.receipt_number}, New Balance: ₹${res.updated_balance}`);
      setPayment({ customer_id: '', amount_paid: '', payment_mode: 'CASH', notes: '' });
    } catch (err) {
      setStatusMsg(`Payment Error: ${err.message}`);
    }
  };

  if (!sessionToken) {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '400px', margin: 'auto' }}>
        <h2>Hardware Terminal Locking</h2>
        <p>Device GUID: <code>{HARDWARE_DEVICE_GUID}</code></p>
        <button onClick={handleDeviceAuth} style={{ width: '100%', padding: '12px', background: '#D4AF37', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          Authenticate Hardware
        </button>
        <p>{statusMsg}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1000px', margin: 'auto' }}>
      <h1>Gold Trading Terminal (Sprint 1)</h1>
      <div style={{ padding: '10px', background: '#f0f0f0', marginBottom: '20px', borderRadius: '4px' }}>
        <strong>Status:</strong> {statusMsg} | <strong>Security Level:</strong> Volatile RAM Only
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* GOLD RATES MODULE */}
        <section style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '6px' }}>
          <h3>Update Daily Rates</h3>
          <form onSubmit={submitRates}>
            <div>
              <label>999 Sell Rate:</label><br />
              <input type="number" step="0.01" value={rates.rate_999_sell} onChange={e => setRates({...rates, rate_999_sell: e.target.value})} required />
            </div>
            <div>
              <label>22K (49) Sell Rate:</label><br />
              <input type="number" step="0.01" value={rates.rate_49_sell} onChange={e => setRates({...rates, rate_49_sell: e.target.value})} required />
            </div>
            <div>
              <label>999 Buy Rate:</label><br />
              <input type="number" step="0.01" value={rates.rate_999_buy} onChange={e => setRates({...rates, rate_999_buy: e.target.value})} required />
            </div>
            <div>
              <label>Fine Gatti Buy Rate:</label><br />
              <input type="number" step="0.01" value={rates.rate_fine_gatti_buy} onChange={e => setRates({...rates, rate_fine_gatti_buy: e.target.value})} required />
            </div>
            <br />
            <button type="submit" style={{ background: '#28a745', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px' }}>Save Today's Rates</button>
          </form>
        </section>

        {/* CUSTOMER REGISTRATION */}
        <section style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '6px' }}>
          <h3>Register Customer</h3>
          <form onSubmit={createCustomer}>
            <div>
              <label>Full Name:</label><br />
              <input type="text" value={customer.full_name} onChange={e => setCustomer({...customer, full_name: e.target.value})} required />
            </div>
            <div>
              <label>Phone Number:</label><br />
              <input type="text" value={customer.phone_number} onChange={e => setCustomer({...customer, phone_number: e.target.value})} required />
            </div>
            <div>
              <label>Address:</label><br />
              <textarea value={customer.address} onChange={e => setCustomer({...customer, address: e.target.value})}></textarea>
            </div>
            <br />
            <button type="submit" style={{ background: '#007bff', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px' }}>Create Customer</button>
          </form>
        </section>

        {/* DEBT PAYMENTS */}
        <section style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '6px', gridColumn: 'span 2' }}>
          <h3>Process Debt Payment</h3>
          <div style={{ marginBottom: '15px' }}>
            <input type="text" placeholder="Search Customer Phone..." value={searchPhone} onChange={e => setSearchPhone(e.target.value)} />
            <button type="button" onClick={searchCustomers} style={{ marginLeft: '10px' }}>Search</button>
            {searchResults.length > 0 && (
              <ul style={{ background: '#fff', border: '1px solid #ddd', padding: '10px', listStyle: 'none' }}>
                {searchResults.map(c => (
                  <li key={c.customer_id} style={{ padding: '5px 0', borderBottom: '1px solid #eee' }}>
                    {c.full_name} ({c.phone_number}) - Balance: <strong>₹{c.pending_balance}</strong>
                    <button type="button" onClick={() => setPayment({...payment, customer_id: c.customer_id})} style={{ marginLeft: '15px', padding: '2px 8px' }}>Select</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form onSubmit={submitPayment}>
            <div>
              <label>Selected Customer ID:</label><br />
              <input type="text" value={payment.customer_id} readOnly required style={{ width: '300px', background: '#eee' }} />
            </div>
            <div>
              <label>Amount Paid:</label><br />
              <input type="number" step="0.01" value={payment.amount_paid} onChange={e => setPayment({...payment, amount_paid: e.target.value})} required />
            </div>
            <div>
              <label>Payment Mode:</label><br />
              <select value={payment.payment_mode} onChange={e => setPayment({...payment, payment_mode: e.target.value})}>
                <option value="CASH">CASH</option>
                <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                <option value="CHEQUE">CHEQUE</option>
              </select>
            </div>
            <div>
              <label>Notes:</label><br />
              <input type="text" value={payment.notes} onChange={e => setPayment({...payment, notes: e.target.value})} />
            </div>
            <br />
            <button type="submit" style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold' }}>Execute Debt Payment</button>
          </form>
        </section>
      </div>
    </div>
  );
}
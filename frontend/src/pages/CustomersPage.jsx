import { useState } from 'react';
import Feedback from '../components/Feedback.jsx';
import FormField from '../components/FormField.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useCustomerSearch } from '../hooks/useCustomerSearch.js';
import { useDraftForm } from '../hooks/useDraftForm.js';
import { apiRequest } from '../api.js';

const initialCustomer = { full_name: '', phone_number: '', address: '' };

/** Register a customer and search existing customers by partial phone number. */
export default function CustomersPage({ token, deviceGuid, notify, onAuthFailure, onTokenRotated }) {
  const { values, setValues, reset, dirty } = useDraftForm(initialCustomer);
  const search = useCustomerSearch(token, deviceGuid, onAuthFailure, onTokenRotated);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState('');

  const errors = {
    full_name: touched.full_name && !values.full_name.trim() ? 'Enter the customer’s name.' : '',
    phone_number: touched.phone_number && !values.phone_number.trim() ? 'Enter a phone number.' : '',
  };

  async function submit(event) {
    event.preventDefault();
    setTouched({ full_name: true, phone_number: true });
    if (!values.full_name.trim() || !values.phone_number.trim()) return;
    setSaving(true);
    setFormError('');
    try {
      const customer = await apiRequest('/api/customers', {
        method: 'POST',
        token,
        deviceGuid,
        onAuthFailure,
        onTokenRotated,
        body: JSON.stringify({
          full_name: values.full_name.trim(),
          phone_number: values.phone_number.trim(),
          address: values.address.trim(),
        }),
      });
      reset(initialCustomer);
      setTouched({});
      notify(`Customer registered · ID ${customer.customer_id}`);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-view" aria-labelledby="customers-title">
      <div className="page-heading">
        <div><p className="eyebrow">CUSTOMER DESK / DIRECTORY</p><h1 id="customers-title">Customers</h1>
          <p>Register a customer or find an existing account by phone.</p></div>
        <span className="section-count">CREATE + SEARCH</span>
      </div>
      <div className="customer-layout">
        <section className="surface-card" aria-labelledby="register-title">
          <div className="card-heading"><span className="card-index">01</span><div><h2 id="register-title">Register customer</h2><p>Add contact details to the customer directory.</p></div></div>
          {formError && <Feedback kind="error" title="Customer was not registered">{formError}</Feedback>}
          <form className="stacked-form" onSubmit={submit} noValidate>
            <FormField id="full_name" label="Full name" required error={errors.full_name}>
              <input id="full_name" autoComplete="name" required value={values.full_name} aria-invalid={Boolean(errors.full_name)}
                onBlur={() => setTouched((current) => ({ ...current, full_name: true }))}
                onChange={(event) => { setValues((current) => ({ ...current, full_name: event.target.value })); setFormError(''); }} />
            </FormField>
            <FormField id="phone_number" label="Phone number" required error={errors.phone_number} hint="Use the number the customer will search by.">
              <input id="phone_number" type="tel" autoComplete="tel" required value={values.phone_number} aria-invalid={Boolean(errors.phone_number)}
                onBlur={() => setTouched((current) => ({ ...current, phone_number: true }))}
                onChange={(event) => { setValues((current) => ({ ...current, phone_number: event.target.value })); setFormError(''); }} />
            </FormField>
            <FormField id="address" label="Address" hint="Optional">
              <textarea id="address" rows="3" autoComplete="street-address" value={values.address}
                onChange={(event) => setValues((current) => ({ ...current, address: event.target.value }))} />
            </FormField>
            <div className="form-actions">
              <span className="draft-label">{dirty ? 'Unsaved changes · held in memory only' : 'Address is optional'}</span>
              <button className="button button-primary" type="submit" disabled={saving}>
                {saving ? 'Registering…' : 'Register customer'}
              </button>
            </div>
          </form>
        </section>

        <section className="surface-card" aria-labelledby="search-title">
          <div className="card-heading"><span className="card-index">02</span><div><h2 id="search-title">Find a customer</h2><p>Search matches by part of the phone number.</p></div></div>
          <FormField id="customer-search" label="Phone number" hint="Results update after you pause typing.">
            <input id="customer-search" type="search" inputMode="tel" autoComplete="off" value={search.query}
              aria-describedby="customer-search-hint" onChange={(event) => search.setQuery(event.target.value)} />
          </FormField>
          <div className="search-results" aria-live="polite">
            {search.status === 'idle' && <Feedback title="Ready to search">Enter a phone number to see matching customers.</Feedback>}
            {search.status === 'loading' && <Skeleton rows={3} />}
            {search.status === 'error' && <Feedback kind="error" title="Search failed">{search.error}</Feedback>}
            {search.status === 'empty' && <Feedback title="No matching customers">Try another phone number or register a new customer.</Feedback>}
            {search.status === 'success' && (
              <ul className="customer-results">
                {search.rows.map((customer) => (
                  <li className="customer-result" key={customer.customer_id}>
                    <span className="customer-avatar" aria-hidden="true">{customer.full_name?.trim()?.charAt(0)?.toUpperCase() || '?'}</span>
                    <span className="customer-result-details"><strong>{customer.full_name}</strong><small>{customer.phone_number}</small></span>
                    <span className="balance-preview">₹{customer.pending_balance ?? '—'}<small>balance</small></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

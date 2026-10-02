import FormField from './FormField.jsx';
import Feedback from './Feedback.jsx';
import { useCustomerSearch } from '../hooks/useCustomerSearch.js';

/** Search and select a customer while showing their live debt balance. */
export default function FinanceCustomerPicker({ token, deviceGuid, onAuthFailure, onTokenRotated, selected, onSelect }) {
  const search = useCustomerSearch(token, deviceGuid, onAuthFailure, onTokenRotated);

  return (
    <div className="finance-customer-picker">
      <FormField id="finance-customer-search" label="Find customer" hint="Search by name or phone number.">
        <input id="finance-customer-search" type="search" autoComplete="off" value={search.query}
          onChange={(event) => { search.setQuery(event.target.value); onSelect(null); }} />
      </FormField>
      {selected && (
        <div className="debt-banner" role="status">
          <strong>{selected.full_name}</strong>
          <span>Pending balance: ₹{selected.pending_balance ?? '0.00'}</span>
          <button className="button button-quiet" type="button" onClick={() => onSelect(null)}>Change customer</button>
        </div>
      )}
      {!selected && search.status === 'loading' && <p className="field-hint" role="status">Searching customers…</p>}
      {!selected && search.status === 'error' && <Feedback kind="error" title="Search failed">{search.error}</Feedback>}
      {!selected && search.status === 'empty' && <Feedback kind="info" title="No matches">Try a different name or phone number.</Feedback>}
      {!selected && search.rows.length > 0 && (
        <ul className="finance-customer-results">
          {search.rows.map((customer) => (
            <li key={customer.customer_id}>
              <span><strong>{customer.full_name}</strong><small>{customer.phone_number} · ₹{customer.pending_balance ?? '0.00'}</small></span>
              <button className="button button-secondary" type="button" onClick={() => onSelect(customer)}>Select</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

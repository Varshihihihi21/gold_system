import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

/** Search customers by phone after the operator pauses typing for 300 ms. */
export function useCustomerSearch(token, deviceGuid, onAuthFailure) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState({ status: 'idle', rows: [], error: '' });
  const updateQuery = useCallback((value) => {
    setQuery(value);
    setResult(value.trim()
      ? { status: 'loading', rows: [], error: '' }
      : { status: 'idle', rows: [], error: '' });
  }, []);

  useEffect(() => {
    const phone = query.trim();
    if (!phone) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      if (!active) return;
      setResult({ status: 'loading', rows: [], error: '' });
      try {
        const rows = await apiRequest(`/api/customers/search?phone=${encodeURIComponent(phone)}`, {
          token,
          deviceGuid,
          onAuthFailure,
        });
        if (active) setResult({ status: rows.length ? 'success' : 'empty', rows, error: '' });
      } catch (error) {
        if (active) setResult({ status: 'error', rows: [], error: error.message });
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, token, deviceGuid, onAuthFailure]);

  return { query, setQuery: updateQuery, ...result };
}

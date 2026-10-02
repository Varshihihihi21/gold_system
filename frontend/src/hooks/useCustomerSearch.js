import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api.js';

/** Search customers by name or phone after the operator pauses for 300 ms. */
export function useCustomerSearch(token, deviceGuid, onAuthFailure, onTokenRotated) {
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState({ status: 'idle', rows: [], error: '' });
  const updateQuery = useCallback((value) => {
    setQuery(value);
    setResult(value.trim()
      ? { status: 'loading', rows: [], error: '' }
      : { status: 'idle', rows: [], error: '' });
  }, []);

  useEffect(() => {
    const search = query.trim();
    if (!search) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      if (!active) return;
      setResult({ status: 'loading', rows: [], error: '' });
      try {
        const rows = await apiRequest(`/api/customers/search?q=${encodeURIComponent(search)}`, {
          token: tokenRef.current,
          deviceGuid,
          onAuthFailure,
          onTokenRotated,
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
  }, [query, deviceGuid, onAuthFailure, onTokenRotated]);

  return { query, setQuery: updateQuery, ...result };
}

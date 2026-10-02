import { useCallback, useState } from 'react';

/**
 * Keep form values in React memory only and discard them when the view unmounts.
 * @param {object} initialValue Empty form values.
 * @returns {{values: object, setValues: Function, reset: Function, dirty: boolean}}
 */
export function useDraftForm(initialValue) {
  const [values, setFormValues] = useState(initialValue);
  const [dirty, setDirty] = useState(false);

  const setValues = useCallback((update) => {
    setFormValues((current) => (typeof update === 'function' ? update(current) : update));
    setDirty(true);
  }, []);

  const reset = useCallback((nextValue = initialValue) => {
    setFormValues(nextValue);
    setDirty(false);
  }, [initialValue]);

  return { values, setValues, reset, dirty };
}

/** Return true for finite numeric input with at most two decimal places. */
export function isValidTwoDecimalInput(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const number = Number(value);
  return Number.isFinite(number)
    && Math.abs(number * 100 - Math.round(number * 100)) < 1e-8;
}

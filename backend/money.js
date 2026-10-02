const MAX_CENTS = 999999999999n;

/** Parse a decimal amount into exact integer cents. */
function parseMoneyCents(value, label = 'Amount', { allowSigned = false } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`${label} must be a decimal string or number.`);
  }
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match || (!allowSigned && match[1])) {
    throw new TypeError(`${label} must be a ${allowSigned ? 'signed ' : 'non-negative '}amount with at most 2 decimal places.`);
  }
  if (match[2].length > 10 || text.length > 16) {
    throw new RangeError(`${label} exceeds DECIMAL(12,2).`);
  }
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0') || '0');
  if (cents > MAX_CENTS) throw new RangeError(`${label} exceeds DECIMAL(12,2).`);
  return match[1] ? -cents : cents;
}

/** Format integer cents as a fixed two-decimal string. */
function formatMoneyCents(cents) {
  const absolute = cents < 0n ? -cents : cents;
  const sign = cents < 0n ? '-' : '';
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

module.exports = { parseMoneyCents, formatMoneyCents, MAX_CENTS };

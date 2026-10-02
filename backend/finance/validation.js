const { parseMoneyCents } = require('../money');

const MAX_WEIGHT_UNITS = 999999999999n;

/** Parse a non-negative decimal into fixed-scale integer units. */
function parseScaled(value, scale, label, max = MAX_WEIGHT_UNITS) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`${label} must be a decimal value.`);
  }
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2] || '').length > scale) {
    throw new TypeError(`${label} must have at most ${scale} decimal places.`);
  }
  if (match[1].length > 12 || text.length > 20) throw new RangeError(`${label} exceeds its supported range.`);
  const units = BigInt(match[1]) * 10n ** BigInt(scale)
    + BigInt((match[2] || '').padEnd(scale, '0') || '0');
  if (units > max) throw new RangeError(`${label} exceeds its supported range.`);
  return units;
}

/** Parse four-decimal physical weight units. */
function parseWeight(value, label = 'Weight') {
  const result = parseScaled(value, 4, label);
  if (result === 0n) throw new RangeError(`${label} must be greater than zero.`);
  return result;
}

/** Format fixed-scale integer units without floating-point conversion. */
function formatScaled(units, scale) {
  const factor = 10n ** BigInt(scale);
  return `${units / factor}.${String(units % factor).padStart(scale, '0')}`;
}

/** Round an integer ratio half-up. */
function roundRatio(numerator, denominator) {
  return numerator / denominator + (numerator % denominator * 2n >= denominator ? 1n : 0n);
}

/** Validate an amount and return integer cents. */
function parsePositiveMoney(value, label) {
  const cents = parseMoneyCents(value, label);
  if (cents <= 0n) throw new RangeError(`${label} must be greater than zero.`);
  return cents;
}

module.exports = { parseScaled, parseWeight, formatScaled, roundRatio, parsePositiveMoney };

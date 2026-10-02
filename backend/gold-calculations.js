const MONEY_SCALE = 2;
const WEIGHT_SCALE = 4;
const MAX_WEIGHT_UNITS = 999999999999n;
const { parseMoneyCents, formatMoneyCents, MAX_CENTS } = require('./money');

function parseScaled(value, scale, label) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`${label} must be a decimal string or number.`);
  }

  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new TypeError(`${label} must be a non-negative decimal.`);
  if (match[1].length > 16 || text.length > 32) throw new RangeError(`${label} exceeds the supported range.`);
  const fraction = match[2] || '';
  if (fraction.length > scale) {
    throw new RangeError(`${label} supports at most ${scale} decimal places.`);
  }

  const units = BigInt(match[1]) * (10n ** BigInt(scale))
    + BigInt(fraction.padEnd(scale, '0') || '0');
  return units;
}

function roundRatio(numerator, denominator) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

function parseWeight(value) {
  const units = parseScaled(value, WEIGHT_SCALE, 'Weight');
  if (units > MAX_WEIGHT_UNITS) throw new RangeError('Weight exceeds DECIMAL(12,4).');
  return units;
}

function parsePositiveRate(value, label) {
  const rate = parseMoneyCents(value, label);
  if (rate === 0n) throw new RangeError(`${label} must be greater than zero.`);
  return rate;
}

function formatScaled(units, scale) {
  const factor = 10n ** BigInt(scale);
  const whole = units / factor;
  const fraction = String(units % factor).padStart(scale, '0');
  return `${whole}.${fraction}`;
}

function moneyFromWeightAndRate(weightUnits, rateCents) {
  const cents = roundRatio(weightUnits * rateCents, 10n ** BigInt(WEIGHT_SCALE));
  if (cents > MAX_CENTS) throw new RangeError('Calculated amount exceeds DECIMAL(12,2).');
  return cents;
}

function fineWeightForSale(weightUnits, category) {
  const factor = category === '999' ? 9990n : 9999n;
  return roundRatio(weightUnits * factor, 10000n);
}

/** Calculate a 999 sale total using four-decimal gram input and cent output. */
function calculate999Sale(weightGrams, ratePerGram) {
  const weight = parseWeight(weightGrams);
  const rate = parsePositiveRate(ratePerGram, '999 sales rate');
  if (weight === 0n) throw new RangeError('Weight must be greater than zero.');
  const cents = moneyFromWeightAndRate(weight, rate);
  return {
    billedWeightGrams: formatScaled(weight, WEIGHT_SCALE),
    fineWeightGrams: formatScaled(fineWeightForSale(weight, '999'), WEIGHT_SCALE),
    lineTotal: formatMoneyCents(cents),
  };
}

/** Apply the 0.1% surcharge before calculating a 49 sale total. */
function calculate49Sale(weightGrams, ratePerGram) {
  const weight = parseWeight(weightGrams);
  const rate = parsePositiveRate(ratePerGram, '49 sales rate');
  if (weight === 0n) throw new RangeError('Weight must be greater than zero.');
  const billedWeight = roundRatio(weight * 1001n, 1000n);
  if (billedWeight > MAX_WEIGHT_UNITS) throw new RangeError('Billed weight exceeds DECIMAL(12,4).');
  const cents = moneyFromWeightAndRate(billedWeight, rate);
  return {
    billedWeightGrams: formatScaled(billedWeight, WEIGHT_SCALE),
    fineWeightGrams: formatScaled(fineWeightForSale(weight, '49'), WEIGHT_SCALE),
    lineTotal: formatMoneyCents(cents),
  };
}

/** Calculate Gatti fine weight and payout at the fine-gold purchase rate. */
function calculateGattiPurchase(weightGrams, touchPercentage, fineGoldRate) {
  const weight = parseWeight(weightGrams);
  const touch = parseScaled(touchPercentage, 2, 'Touch percentage');
  const rate = parsePositiveRate(fineGoldRate, 'Fine gold purchase rate');
  if (weight === 0n) throw new RangeError('Weight must be greater than zero.');
  if (touch === 0n || touch > 10000n) throw new RangeError('Touch percentage must be greater than 0 and at most 100.');
  const fineWeight = roundRatio(weight * touch, 10000n);
  const cents = moneyFromWeightAndRate(fineWeight, rate);
  return {
    fineWeightGrams: formatScaled(fineWeight, WEIGHT_SCALE),
    payout: formatMoneyCents(cents),
  };
}

/** Calculate a 999 buyback payout from gross weight and the 999 buy rate. */
function calculate999Purchase(weightGrams, buyRate) {
  const weight = parseWeight(weightGrams);
  const rate = parsePositiveRate(buyRate, '999 buy rate');
  if (weight === 0n) throw new RangeError('Weight must be greater than zero.');
  const cents = moneyFromWeightAndRate(weight, rate);
  const fineWeight = roundRatio(weight * 9990n, 10000n);
  return { fineWeightGrams: formatScaled(fineWeight, WEIGHT_SCALE), payout: formatMoneyCents(cents) };
}

/** Compare two monetary values without floating-point rounding. */
function isPriceWithinTolerance(expected, submitted, tolerance = '0.01') {
  const expectedCents = parseMoneyCents(expected, 'Expected price');
  const submittedCents = parseMoneyCents(submitted, 'Submitted price');
  const toleranceCents = parseMoneyCents(tolerance, 'Price tolerance');
  const difference = expectedCents >= submittedCents
    ? expectedCents - submittedCents
    : submittedCents - expectedCents;
  return difference <= toleranceCents;
}

module.exports = {
  calculate999Sale,
  calculate49Sale,
  calculate999Purchase,
  calculateGattiPurchase,
  isPriceWithinTolerance,
};

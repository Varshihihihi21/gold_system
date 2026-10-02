function decimalUnits(value, scale) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value ?? '').trim());
  if (!match || (match[2] || '').length > scale) return null;
  return BigInt(match[1]) * 10n ** BigInt(scale)
    + BigInt((match[2] || '').padEnd(scale, '0') || '0');
}

function roundedRatio(numerator, denominator) {
  return numerator / denominator + (numerator % denominator * 2n >= denominator ? 1n : 0n);
}

function moneyText(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

/** Calculate the exact cent amount and fine grams shown in the sale form. */
export function previewSale(category, weight, rate) {
  const weightUnits = decimalUnits(weight, 4);
  const rateCents = decimalUnits(rate, 2);
  if (!weightUnits || !rateCents || weightUnits <= 0n || rateCents <= 0n) return null;
  const billedUnits = category === '49' ? roundedRatio(weightUnits * 1001n, 1000n) : weightUnits;
  const fineUnits = roundedRatio(weightUnits * (category === '999' ? 9990n : 9999n), 10000n);
  const cents = roundedRatio(billedUnits * rateCents, 10000n);
  return { lineTotal: moneyText(cents), billedWeight: scaledText(billedUnits), fineWeight: scaledText(fineUnits) };
}

/** Calculate exact buyback fine weight and cash payout for a purchase form. */
export function previewPurchase(category, weight, touch, rate) {
  const weightUnits = decimalUnits(weight, 4);
  const rateCents = decimalUnits(rate, 2);
  const touchUnits = category === 'GATTI' ? decimalUnits(touch, 2) : 9990n;
  if (!weightUnits || !rateCents || !touchUnits || weightUnits <= 0n || rateCents <= 0n
      || touchUnits <= 0n || touchUnits > 10000n) return null;
  const fineUnits = category === 'GATTI'
    ? roundedRatio(weightUnits * touchUnits, 10000n)
    : roundedRatio(weightUnits * 9990n, 10000n);
  const payoutCents = roundedRatio(weightUnits * rateCents, 10000n);
  return { fineWeight: scaledText(fineUnits), payout: moneyText(category === 'GATTI'
    ? roundedRatio(fineUnits * rateCents, 10000n)
    : payoutCents) };
}

function scaledText(units) {
  return `${units / 10000n}.${String(units % 10000n).padStart(4, '0')}`;
}

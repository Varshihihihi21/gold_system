const test = require('node:test');
const assert = require('node:assert/strict');
const { validOwnerPin, hashOwnerPin, verifyOwnerPin } = require('../finance/owner-pin');
const { FinanceError } = require('../finance/errors');

test('owner PIN validation enforces a non-empty 6–128 character secret', () => {
  assert.equal(validOwnerPin('123456'), true);
  assert.equal(validOwnerPin('x'.repeat(128)), true);
  assert.equal(validOwnerPin('12345'), false);
  assert.equal(validOwnerPin('x'.repeat(129)), false);
  assert.equal(validOwnerPin(123456), false);
});

test('owner PIN verification accepts the configured secret and rejects a mismatch', async () => {
  const { salt, hash } = await hashOwnerPin('secure-owner-pin');
  const client = {
    query: async () => ({
      rows: [{ owner_user_id: 'owner-id', pin_salt: salt, pin_hash: hash }],
    }),
  };

  assert.equal(await verifyOwnerPin(client, 'secure-owner-pin'), 'owner-id');
  await assert.rejects(
    verifyOwnerPin(client, 'incorrect-owner-pin'),
    (error) => error instanceof FinanceError && error.status === 403
  );
});

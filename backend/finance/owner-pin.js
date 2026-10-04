const crypto = require('node:crypto');
const { FinanceError } = require('./errors');

const HASH_BYTES = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function validOwnerPin(pin) {
  return typeof pin === 'string' && pin.length >= 6 && pin.length <= 128;
}

function hashOwnerPin(pin, salt = crypto.randomBytes(16)) {
  if (!validOwnerPin(pin)) throw new TypeError('Owner PIN/password must be 6–128 characters.');
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, HASH_BYTES, SCRYPT_OPTIONS, (error, hash) => {
      if (error) reject(error);
      else resolve({ salt, hash });
    });
  });
}

async function verifyOwnerPin(client, pin) {
  if (!validOwnerPin(pin)) throw new FinanceError(403, 'Enter the configured owner PIN/password.');
  const result = await client.query(
    `SELECT owner_user_id, pin_salt, pin_hash
     FROM owner_pin_credentials WHERE credential_id = 1`
  );
  const credential = result.rows[0];
  if (!credential) {
    throw new FinanceError(503, 'Owner PIN is not configured. Run the owner PIN setup command first.');
  }
  const { hash } = await hashOwnerPin(pin, credential.pin_salt);
  const storedHash = Buffer.from(credential.pin_hash);
  if (storedHash.length !== hash.length || !crypto.timingSafeEqual(storedHash, hash)) {
    throw new FinanceError(403, 'Owner PIN/password is incorrect.');
  }
  return credential.owner_user_id;
}

async function recordOwnerAction(client, { ownerUserId, deviceId, action, referenceId = null, details = {} }) {
  await client.query(
    `INSERT INTO owner_action_audit
       (owner_user_id, device_id, action, reference_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [ownerUserId, deviceId, action, referenceId, JSON.stringify(details)]
  );
}

module.exports = { validOwnerPin, hashOwnerPin, verifyOwnerPin, recordOwnerAction };

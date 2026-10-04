const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createChallenge, parseDevicePublicKey, verifyDeviceSignature } = require('../device-auth');

test('challenge contains a 32-byte random nonce and an unguessable ID', () => {
  const first = createChallenge();
  const second = createChallenge();
  assert.equal(Buffer.from(first.challenge, 'base64url').length, 32);
  assert.match(first.challengeId, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.challengeId, second.challengeId);
});

test('challenge proof verifies only the matching Ed25519 key and nonce', () => {
  const pair = crypto.generateKeyPairSync('ed25519');
  const nonce = crypto.randomBytes(32);
  const signature = crypto.sign(null, nonce, pair.privateKey).toString('base64');
  assert.equal(verifyDeviceSignature(pair.publicKey.export({ type: 'spki', format: 'pem' }), nonce, signature), true);
  assert.equal(verifyDeviceSignature(pair.publicKey.export({ type: 'spki', format: 'pem' }), Buffer.alloc(32), signature), false);
  assert.equal(verifyDeviceSignature(pair.publicKey.export({ type: 'spki', format: 'pem' }), nonce, '%%%'), false);
});

test('device public-key parser accepts canonical and SQL-escaped SPKI PEM', () => {
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const escapedPem = publicKey.replace(/\n/g, '\\n');

  assert.equal(parseDevicePublicKey(publicKey).asymmetricKeyType, 'ed25519');
  assert.equal(parseDevicePublicKey(escapedPem).asymmetricKeyType, 'ed25519');
  assert.throws(() => parseDevicePublicKey('not a public key'), /public key is malformed/);
  assert.throws(() => parseDevicePublicKey(pair.privateKey.export({ type: 'pkcs8', format: 'pem' })), /public key is malformed/);
});

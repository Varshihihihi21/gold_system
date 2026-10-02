const crypto = require('node:crypto');

/** Generate a random challenge identifier and 32-byte nonce. */
function createChallenge() {
  const nonce = crypto.randomBytes(32);
  return {
    challengeId: crypto.randomBytes(32).toString('base64url'),
    challenge: nonce.toString('base64url'),
    nonce,
  };
}

/** Verify a canonical base64 Ed25519 signature against the given nonce. */
function verifyDeviceSignature(publicKeyPem, nonce, signatureBase64) {
  if (typeof signatureBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signatureBase64)) return false;
  const signature = Buffer.from(signatureBase64, 'base64');
  if (signature.length !== 64 || signature.toString('base64') !== signatureBase64) return false;
  const publicKey = crypto.createPublicKey(publicKeyPem);
  if (publicKey.asymmetricKeyType !== 'ed25519') return false;
  return crypto.verify(null, nonce, publicKey, signature);
}

module.exports = { createChallenge, verifyDeviceSignature };

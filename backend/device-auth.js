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
  const publicKey = parseDevicePublicKey(publicKeyPem);
  return crypto.verify(null, nonce, publicKey, signature);
}

/** Parse the exact public-key format exported by the Electron terminal. */
function parseDevicePublicKey(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Registered device public key is missing or is not text.');
  }
  const normalized = value.trim().replace(/\\n/g, '\n').replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('-----BEGIN PUBLIC KEY-----')
      || !normalized.endsWith('-----END PUBLIC KEY-----')) {
    throw new TypeError(
      'Registered device public key is malformed. Copy the full Ed25519 public key from this terminal and update its device row.'
    );
  }
  let publicKey;
  try {
    publicKey = crypto.createPublicKey(normalized);
  } catch {
    throw new TypeError(
      'Registered device public key is malformed. Copy the full Ed25519 public key from this terminal and update its device row.'
    );
  }
  if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') {
    throw new TypeError(
      'Registered device key must be an Ed25519 public key in SPKI PEM format.'
    );
  }
  return publicKey;
}

module.exports = { createChallenge, parseDevicePublicKey, verifyDeviceSignature };

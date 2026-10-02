const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const CREDENTIAL_FILE = 'device-credential.bin';
let privateKey;

/** Read and validate the administrator-assigned device identifier. */
function getDeviceGuid() {
  const value = process.env.GOLD_DEVICE_GUID;
  if (!value || value.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new Error('Set GOLD_DEVICE_GUID to the device identifier registered by your administrator.');
  }
  return value;
}

function getPrivateKey() {
  if (privateKey) return privateKey;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-protected credential storage is unavailable on this device.');
  }
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error('A Linux secret-service keyring is required; basic-text credential storage is not accepted.');
  }

  const credentialPath = path.join(app.getPath('userData'), CREDENTIAL_FILE);
  if (fs.existsSync(credentialPath)) {
    privateKey = crypto.createPrivateKey(safeStorage.decryptString(fs.readFileSync(credentialPath)));
    return privateKey;
  }

  const pair = crypto.generateKeyPairSync('ed25519');
  const encrypted = safeStorage.encryptString(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  fs.mkdirSync(path.dirname(credentialPath), { recursive: true });
  fs.writeFileSync(credentialPath, encrypted, { mode: 0o600, flag: 'wx' });
  privateKey = pair.privateKey;
  return privateKey;
}

/** Return the SPKI public key corresponding to the OS-protected private key. */
function getPublicKey() {
  return crypto.createPublicKey(getPrivateKey()).export({ type: 'spki', format: 'pem' });
}

/** Sign a base64url-encoded 32-byte server challenge. */
function signChallenge(challenge) {
  if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    throw new TypeError('The server challenge is invalid.');
  }
  const nonce = Buffer.from(challenge, 'base64url');
  if (nonce.length !== 32) throw new TypeError('The server challenge is invalid.');
  return crypto.sign(null, nonce, getPrivateKey()).toString('base64');
}

module.exports = { getDeviceGuid, getPublicKey, signChallenge };

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const readline = require('node:readline');
const { stdin, stdout } = require('node:process');
const pool = require('./db');
const { hashOwnerPin } = require('./finance/owner-pin');

async function main() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the PIN is not echoed.');
  }
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  try {
    const ownerName = (await textQuestion(rl, 'Owner display name: ')).trim();
    if (!ownerName || ownerName.length > 200) throw new Error('Owner display name must be 1–200 characters.');
    const pin = await secretQuestion(rl, 'New owner PIN/password (6–128 characters): ');
    const confirmation = await secretQuestion(rl, 'Confirm owner PIN/password: ');
    if (pin !== confirmation) throw new Error('PIN/password confirmation did not match.');
    const { salt, hash } = await hashOwnerPin(pin);
    await pool.query(
      `INSERT INTO owner_pin_credentials (credential_id, owner_name, pin_salt, pin_hash)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (credential_id) DO UPDATE
       SET owner_name = EXCLUDED.owner_name, pin_salt = EXCLUDED.pin_salt,
           pin_hash = EXCLUDED.pin_hash, updated_at = NOW()`,
      [ownerName, salt, hash]
    );
    stdout.write('Owner PIN/password saved. The plaintext value was not stored or logged.\n');
  } finally {
    rl.close();
    await pool.end();
  }
}

function secretQuestion(rl, prompt) {
  return new Promise((resolve, reject) => {
    try {
      rl.question(prompt, { hideEchoBack: true }, resolve);
    } catch (error) {
      reject(error);
    }
  });
}

function textQuestion(rl, prompt) {
  return new Promise((resolve, reject) => {
    try {
      rl.question(prompt, resolve);
    } catch (error) {
      reject(error);
    }
  });
}

main().catch((error) => {
  console.error(`Could not configure owner PIN: ${error.message}`);
  process.exitCode = 1;
});

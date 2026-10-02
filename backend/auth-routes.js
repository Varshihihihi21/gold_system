const express = require('express');
const jwt = require('jsonwebtoken');
const { createChallenge, verifyDeviceSignature } = require('./device-auth');

/** Create public challenge/login routes for provisioned terminal keys. */
function createAuthRouter(pool, jwtSecret, tokenTtl) {
  const router = express.Router();

  router.post('/device-challenge', async (req, res) => {
    const deviceGuid = req.body?.device_guid;
    if (typeof deviceGuid !== 'string' || !deviceGuid.trim() || deviceGuid.length > 100) {
      return res.status(400).json({ error: 'A valid device_guid is required.' });
    }
    try {
      const result = await pool.query(
        'SELECT device_id FROM authorised_devices WHERE device_guid = $1 AND is_active = true AND device_public_key IS NOT NULL',
        [deviceGuid.trim()]
      );
      if (!result.rows.length) return res.status(401).json({ error: 'Device is not provisioned or authorized.' });

      const challenge = createChallenge();
      await pool.query('DELETE FROM device_auth_challenges WHERE expires_at <= NOW()');
      await pool.query(
        `INSERT INTO device_auth_challenges (challenge_id, device_id, nonce, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '60 seconds')`,
        [challenge.challengeId, result.rows[0].device_id, challenge.nonce]
      );
      return res.json({ challengeId: challenge.challengeId, challenge: challenge.challenge });
    } catch (err) {
      console.error('Device challenge could not be issued:', err.message);
      return res.status(503).json({ error: 'Device authentication is temporarily unavailable.' });
    }
  });

  router.post('/device-login', async (req, res) => {
    const { device_guid: deviceGuid, challenge_id: challengeId, signature } = req.body || {};
    if (typeof deviceGuid !== 'string' || !deviceGuid.trim() || deviceGuid.length > 100
        || typeof challengeId !== 'string' || typeof signature !== 'string') {
      return res.status(400).json({ error: 'device_guid, challenge_id, and signature are required.' });
    }
    try {
      const result = await pool.query(
        `SELECT device_id, device_guid, device_name, role, device_public_key
         FROM authorised_devices WHERE device_guid = $1 AND is_active = true`,
        [deviceGuid.trim()]
      );
      const device = result.rows[0];
      if (!device || !device.device_public_key) {
        return res.status(401).json({ error: 'Device is not provisioned or authorized.' });
      }
      const challengeResult = await pool.query(
        `DELETE FROM device_auth_challenges
         WHERE challenge_id = $1 AND device_id = $2 AND expires_at > NOW()
         RETURNING nonce`,
        [challengeId, device.device_id]
      );
      const nonce = challengeResult.rows[0]?.nonce;
      if (!nonce || !verifyDeviceSignature(device.device_public_key, nonce, signature)) {
        return res.status(401).json({ error: 'Device proof is invalid or expired.' });
      }
      await pool.query(
        'UPDATE authorised_devices SET last_login_at = NOW(), updated_at = NOW() WHERE device_id = $1',
        [device.device_id]
      );
      const token = jwt.sign(
        { device_id: device.device_id, device_guid: device.device_guid, role: device.role },
        jwtSecret,
        { algorithm: 'HS256', expiresIn: tokenTtl }
      );
      return res.json({
        token,
        device_name: device.device_name,
        device_guid: device.device_guid,
        role: device.role,
      });
    } catch (err) {
      console.error('Device login failed:', err.message);
      return res.status(503).json({ error: 'Device authentication is temporarily unavailable.' });
    }
  });

  return router;
}

module.exports = { createAuthRouter };

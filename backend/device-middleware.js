const jwt = require('jsonwebtoken');

/** Create middleware that verifies license status and rotates valid JWTs. */
function createDeviceMiddleware(pool, jwtSecret, tokenTtl) {
  return async function authenticateDevice(req, res, next) {
    const authHeader = req.headers.authorization;
    const deviceGuid = req.headers['x-device-guid'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing access token' });
    }
    if (!deviceGuid) return res.status(403).json({ error: 'x-device-guid header required' });

    let decoded;
    try {
      decoded = jwt.verify(authHeader.slice('Bearer '.length).trim(), jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }
    if (decoded.device_guid !== deviceGuid || typeof decoded.device_id !== 'string') {
      return res.status(403).json({ error: 'Device hardware mismatch' });
    }
    try {
      const result = await pool.query(
        'SELECT is_active, role FROM authorised_devices WHERE device_id = $1 AND device_guid = $2',
        [decoded.device_id, deviceGuid]
      );
      if (!result.rows.length || !result.rows[0].is_active) {
        return res.status(403).json({ error: 'Device not authorized' });
      }
      req.user = { ...decoded, role: result.rows[0].role };
      res.set('X-Access-Token', jwt.sign(
        { device_id: decoded.device_id, device_guid: decoded.device_guid, role: result.rows[0].role },
        jwtSecret,
        { algorithm: 'HS256', expiresIn: tokenTtl }
      ));
      return next();
    } catch (err) {
      console.error('Device authorization lookup failed:', err.message);
      return res.status(500).json({ error: 'Could not verify device authorization.' });
    }
  };
}

module.exports = { createDeviceMiddleware };

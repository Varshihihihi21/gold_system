-- Apply manually after backup/review. This repository has no migration runner.
-- Keep device_public_key empty until a terminal is securely provisioned.
ALTER TABLE authorised_devices
    ADD COLUMN IF NOT EXISTS device_public_key TEXT;

COMMENT ON COLUMN authorised_devices.device_public_key IS
    'Provisioned Ed25519 SubjectPublicKeyInfo PEM used to verify device login proofs';

CREATE TABLE IF NOT EXISTS device_auth_challenges (
    challenge_id VARCHAR(43) PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES authorised_devices(device_id) ON DELETE CASCADE,
    nonce BYTEA NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_auth_challenges_expiry
    ON device_auth_challenges(expires_at);

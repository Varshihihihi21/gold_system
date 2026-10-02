-- Owner-provided device schema using the actual database table name
-- authorised_devices. This is a reference, not a migration.

CREATE TABLE IF NOT EXISTS authorised_devices (
    device_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_guid VARCHAR(100) NOT NULL UNIQUE,
    device_name VARCHAR(200),
    role VARCHAR(50) NOT NULL DEFAULT 'TERMINAL',
    device_public_key TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    first_authorized_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE authorised_devices IS 'Authorized terminal devices for device-login auth';

CREATE INDEX IF NOT EXISTS idx_device_guid
    ON authorised_devices(device_guid);
CREATE INDEX IF NOT EXISTS idx_device_active
    ON authorised_devices(is_active)
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_device_role
    ON authorised_devices(role);

-- Example seed only. Add the terminal's Ed25519 public key before enabling
-- login; the private key is generated and protected by the Electron client.
-- This conflict clause only handles an existing device_id, not a duplicate GUID.
INSERT INTO authorised_devices (
    device_id, device_guid, device_name, role, is_active, last_login_at
)
VALUES (
    '1bd0ee44-c691-4f62-bc1b-5b41fe46508f',
    'HW-MAC-7F-88-99-00-11-22',
    'Main Terminal',
    'TERMINAL',
    TRUE,
    NOW()
)
ON CONFLICT (device_id) DO NOTHING;

-- Owner-provided device schema, normalized to authorized_devices per the
-- project owner's confirmation. This is a reference, not a migration.

CREATE TABLE IF NOT EXISTS authorized_devices (
    device_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_guid VARCHAR(100) NOT NULL UNIQUE,
    device_name VARCHAR(200),
    role VARCHAR(50) NOT NULL DEFAULT 'TERMINAL',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    first_authorized_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE authorized_devices IS 'Authorized terminal devices for device-login auth';

CREATE INDEX IF NOT EXISTS idx_device_guid
    ON authorized_devices(device_guid);
CREATE INDEX IF NOT EXISTS idx_device_active
    ON authorized_devices(is_active)
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_device_role
    ON authorized_devices(role);

-- Example seed from the owner-provided reference. The conflict clause only
-- handles an existing device_id, not a duplicate device_guid.
INSERT INTO authorized_devices (
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

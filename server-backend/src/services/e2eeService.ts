import { execute, queryMany } from '../repositories/db';

export interface E2eeDeviceKeyDto {
  userId: string;
  deviceId: string;
  publicKey: Record<string, unknown>;
  updatedAt: string;
  lastSeenAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validatePublicKey(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Geçersiz E2EE public key');
  if (value.kty !== 'EC' || value.crv !== 'P-256' || typeof value.x !== 'string' || typeof value.y !== 'string') {
    throw new Error('Geçersiz E2EE public key');
  }
  return value;
}

export async function upsertDeviceKey(userId: string, deviceIdRaw: unknown, publicKeyRaw: unknown): Promise<void> {
  const deviceId = String(deviceIdRaw || '').trim();
  if (!deviceId || deviceId.length > 128) throw new Error('Geçersiz cihaz kimliği');
  const publicKey = validatePublicKey(publicKeyRaw);

  await execute(
    `INSERT INTO e2ee_device_keys (user_id, device_id, public_key)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, device_id)
     DO UPDATE SET public_key = EXCLUDED.public_key, updated_at = now(), last_seen_at = now()`,
    [userId, deviceId, JSON.stringify(publicKey)],
  );
}

export async function listDeviceKeys(userIds: string[]): Promise<E2eeDeviceKeyDto[]> {
  const clean = [...new Set(userIds.map(id => String(id || '').trim()).filter(Boolean))].slice(0, 50);
  if (clean.length === 0) return [];
  const rows = await queryMany<{
    user_id: string;
    device_id: string;
    public_key: Record<string, unknown>;
    updated_at: string;
    last_seen_at: string;
  }>(
    `SELECT user_id::text, device_id, public_key, updated_at::text, last_seen_at::text
       FROM e2ee_device_keys
      WHERE user_id::text = ANY($1::text[])
      ORDER BY user_id::text, last_seen_at DESC`,
    [clean],
  );
  return rows.map(row => ({
    userId: row.user_id,
    deviceId: row.device_id,
    publicKey: row.public_key,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  }));
}

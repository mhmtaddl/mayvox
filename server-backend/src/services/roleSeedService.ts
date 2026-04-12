import type { Pool, PoolClient } from 'pg';
import { SYSTEM_ROLE_CAPS, SYSTEM_ROLE_PRIORITY } from '../capabilities';

type Executor = Pool | PoolClient;

/**
 * Sunucu oluşturulduğunda sistem rollerini + capability'leri seed et.
 * Migration 010 mevcut sunucuları backfill eder; bu helper yeni oluşturulanları kapsar.
 * Idempotent: ON CONFLICT DO NOTHING.
 */
export async function seedSystemRolesForServer(client: Executor, serverId: string): Promise<void> {
  for (const [roleName, caps] of Object.entries(SYSTEM_ROLE_CAPS)) {
    const priority = SYSTEM_ROLE_PRIORITY[roleName] ?? 0;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO roles (server_id, name, priority, is_system)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (server_id, name) DO UPDATE SET priority = EXCLUDED.priority
       RETURNING id`,
      [serverId, roleName, priority]
    );
    const roleId = rows[0]?.id;
    if (!roleId) continue;
    if (caps.length === 0) continue;
    // Capability'leri toplu insert
    const values: string[] = [];
    const params: unknown[] = [];
    caps.forEach((c, i) => {
      values.push(`($1, $${i + 2})`);
      params.push(c);
    });
    await client.query(
      `INSERT INTO role_capabilities (role_id, capability)
       VALUES ${values.join(', ')}
       ON CONFLICT DO NOTHING`,
      [roleId, ...params]
    );
  }
}

/**
 * Üyeyi sistem rolüne bağla. Rol yoksa (örn. eski migration uygulanmamış sunucu)
 * sessizce skip — resolver fallback capability'si legacy server_members.role üzerinden çalışır.
 */
export async function assignSystemRoleToMember(
  client: Executor,
  serverId: string,
  userId: string,
  roleName: 'owner' | 'admin' | 'moderator' | 'member',
): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM roles WHERE server_id = $1 AND name = $2 AND is_system = true',
    [serverId, roleName]
  );
  const roleId = rows[0]?.id;
  if (!roleId) return;
  await client.query(
    `INSERT INTO member_roles (server_id, user_id, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [serverId, userId, roleId]
  );
}

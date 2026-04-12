import { queryMany } from '../repositories/db';
import { getServerAccessContext, assertCapability } from './accessContextService';
import { CAPABILITIES } from '../capabilities';

export interface RoleSummary {
  id: string;
  name: string;
  priority: number;
  isSystem: boolean;
  capabilities: string[];
  memberCount: number;
}

/**
 * Admin panel için roller + effective capabilities + üye sayımı.
 * Sistem rolleri DB'den okunur; capability listesi `role_capabilities` tablosundan
 * (code-level `SYSTEM_ROLE_CAPS` drift olursa DB authoritative).
 */
export async function listServerRoles(serverId: string, callerId: string): Promise<RoleSummary[]> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MANAGE, 'Rolleri görmek için yetkin yok');

  const rows = await queryMany<{
    id: string;
    name: string;
    priority: number;
    is_system: boolean;
    capability: string | null;
    member_count: number;
  }>(
    `SELECT r.id, r.name, r.priority, r.is_system,
            rc.capability,
            COALESCE(mr_count.c, 0)::int AS member_count
     FROM roles r
     LEFT JOIN role_capabilities rc ON rc.role_id = r.id
     LEFT JOIN (
       SELECT role_id, COUNT(*)::int AS c FROM member_roles WHERE server_id = $1 GROUP BY role_id
     ) AS mr_count ON mr_count.role_id = r.id
     WHERE r.server_id = $1
     ORDER BY r.priority DESC`,
    [serverId],
  );

  // Satırları role üzerinde grupla
  const map = new Map<string, RoleSummary>();
  for (const r of rows) {
    let role = map.get(r.id);
    if (!role) {
      role = {
        id: r.id,
        name: r.name,
        priority: r.priority,
        isSystem: r.is_system,
        capabilities: [],
        memberCount: r.member_count,
      };
      map.set(r.id, role);
    }
    if (r.capability) role.capabilities.push(r.capability);
  }

  return Array.from(map.values());
}


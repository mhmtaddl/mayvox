import { queryMany, queryOne } from '../repositories/db';
import type { Channel } from '../types';

/** Sunucunun kanallarını listele (üyelik kontrolü dahil) */
export async function listChannels(serverId: string, userId: string): Promise<Channel[]> {
  // Üyelik kontrolü
  const member = await queryOne<{ id: string }>(
    `SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId]
  );
  if (!member) return [];

  return queryMany<Channel>(
    `SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC, created_at ASC`,
    [serverId]
  );
}

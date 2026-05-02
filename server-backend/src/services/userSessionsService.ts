import { queryMany } from '../repositories/db';

/**
 * userSessionsService
 * ───────────────────
 * Admin paneli için kullanıcı session bilgisi (presence-backed).
 *
 * Source: Hetzner Postgres `user_sessions` tablosu (chat-server presence system yazar).
 */

export interface AdminUserSession {
  session_key: string;
  device_id: string;
  platform: 'desktop' | 'mobile' | 'web';
  app_version: string | null;
  connected_at: string;
  last_heartbeat_at: string;
  disconnected_at: string | null;
  disconnect_reason: string | null;
  is_active: boolean;
}

const MAX_ROWS = 10;

/**
 * Kullanıcının session listesini döndürür.
 * Sıralama:
 *   1) Aktifler (disconnected_at IS NULL) — nulls first via DESC NULLS FIRST
 *   2) Aynı grup içinde: last_heartbeat_at DESC (en güncel heartbeat önde)
 *
 * Side-effect: Inactive rows için disconnected_at DESC doğal olarak elde edilir
 * (non-null'lar kendi aralarında DESC sıralanır).
 */
export async function listUserSessions(userId: string): Promise<AdminUserSession[]> {
  if (!userId || typeof userId !== 'string') return [];
  const data = await queryMany<{
    session_key: string;
    device_id: string;
    platform: 'desktop' | 'mobile' | 'web';
    app_version: string | null;
    connected_at: string;
    last_heartbeat_at: string;
    disconnected_at: string | null;
    disconnect_reason: string | null;
  }>(
    `SELECT session_key, device_id, platform, app_version,
            connected_at::text, last_heartbeat_at::text,
            disconnected_at::text, disconnect_reason
       FROM user_sessions
      WHERE user_id = $1
      ORDER BY (disconnected_at IS NULL) DESC,
               last_heartbeat_at DESC
      LIMIT $2`,
    [userId, MAX_ROWS],
  );

  return data.map((row) => ({
    session_key: row.session_key,
    device_id: row.device_id,
    platform: row.platform as AdminUserSession['platform'],
    app_version: row.app_version ?? null,
    connected_at: row.connected_at,
    last_heartbeat_at: row.last_heartbeat_at,
    disconnected_at: row.disconnected_at ?? null,
    disconnect_reason: row.disconnect_reason ?? null,
    is_active: row.disconnected_at == null,
  }));
}

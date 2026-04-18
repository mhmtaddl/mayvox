import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

/**
 * userSessionsService
 * ───────────────────
 * Admin paneli için kullanıcı session bilgisi (presence-backed).
 *
 * Source: Supabase `user_sessions` tablosu (chat-server presence system yazar).
 * NOT: server-backend pg pool LOCAL Hetzner Postgres'e bakıyor; user_sessions
 * ise Supabase Postgres'te. Bu yüzden Supabase client (anon) ile sorguluyoruz.
 * Tabloda RLS yok → anon read yeterli.
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

function serviceClient() {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
  const supa = serviceClient();
  const { data, error } = await supa
    .from('user_sessions')
    .select(
      'session_key, device_id, platform, app_version, connected_at, last_heartbeat_at, disconnected_at, disconnect_reason',
    )
    .eq('user_id', userId)
    .order('disconnected_at', { ascending: false, nullsFirst: true })
    .order('last_heartbeat_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.error('[userSessionsService] query failed', error.message);
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
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

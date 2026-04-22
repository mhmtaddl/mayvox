/**
 * Auto-punishment uygulayıcı (server-side).
 *
 * - Endpoint'ten çağrılır (chat-server → /internal/auto-punish).
 * - Mevcut chat_banned_* kolonlarını aynı DB-update + broadcast + audit pattern'iyle
 *   günceller (managementService.chatBanMember muadili), ancak capability/hierarchy
 *   check'i BYPASS eder; bunun yerine kendi guard'larını uygular:
 *     * Owner'a ASLA ceza uygulanmaz (hard guard)
 *     * Admin/mod'a MVP'de ceza uygulanmaz (opsiyonel guard — skip eder)
 *     * Zaten aktif chat-ban varsa skip (idempotent)
 * - Actor = 'system:auto-mod'
 *
 * Dedupe (aynı user'a peş peşe ceza) chat-server tarafında (in-memory Map, 5dk cooldown).
 * Burada yine idempotent check (zaten banlı → skip) ikinci savunma katmanıdır.
 */
import { pool, queryOne } from '../repositories/db';
import { invalidateAccessContext } from './accessContextService';
import { broadcastModeration } from './moderationBroadcast';
import { logAction } from './auditLogService';
import { recordEvent as recordModStatEvent } from './moderationStatsService';

export type AutoPunishResult =
  | { applied: false; reason: 'skipped_not_member'   }
  | { applied: false; reason: 'skipped_protected_role'; role: string }
  | { applied: false; reason: 'skipped_already_banned'; expiresAt: string | null }
  | { applied: true;  reason: 'applied';              expiresAt: string };

/**
 * @param serverId
 * @param targetUserId
 * @param durationMinutes  Ceza süresi (1-1440)
 */
export async function applyAutoPunishFlood(
  serverId: string,
  targetUserId: string,
  durationMinutes: number,
): Promise<AutoPunishResult> {
  // 1. Target member
  const target = await queryOne<{
    role: string;
    chat_banned_by: string | null;
    chat_ban_expires_at: string | null;
  }>(
    `SELECT role, chat_banned_by, chat_ban_expires_at
     FROM server_members
     WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId],
  );
  if (!target) return { applied: false, reason: 'skipped_not_member' };

  // 2. Korumalı rol guard — owner ASLA, MVP'de admin/mod de skip
  const role = (target.role || '').toLowerCase();
  if (role === 'owner' || role === 'admin' || role === 'mod' || role === 'moderator') {
    return { applied: false, reason: 'skipped_protected_role', role: target.role };
  }

  // 3. Zaten aktif chat-ban varsa idempotent skip
  const now = Date.now();
  const existingExpires = target.chat_ban_expires_at
    ? new Date(target.chat_ban_expires_at).getTime()
    : null;
  const hasActiveBan = !!target.chat_banned_by && (existingExpires === null || existingExpires > now);
  if (hasActiveBan) {
    return { applied: false, reason: 'skipped_already_banned', expiresAt: target.chat_ban_expires_at };
  }

  // 4. Uygula
  const expiresAt = new Date(now + durationMinutes * 60_000).toISOString();
  const ACTOR = 'system:auto-mod';

  await pool.query(
    `UPDATE server_members
       SET chat_banned_by = $1,
           chat_banned_at = now(),
           chat_ban_expires_at = $2
     WHERE server_id = $3 AND user_id = $4`,
    [ACTOR, expiresAt, serverId, targetUserId],
  );
  invalidateAccessContext(targetUserId, serverId);

  void broadcastModeration({
    userId: targetUserId,
    action: 'chat_ban',
    actorId: ACTOR,
    serverId,
    updates: { chatBannedUntil: expiresAt },
  });

  await logAction({
    serverId,
    actorId: ACTOR,
    action: 'member.chat_ban.auto',
    resourceType: 'member',
    resourceId: targetUserId,
    metadata: {
      reason: 'flood_threshold',
      durationMinutes,
      expiresAt,
      targetRole: target.role,
    },
  });

  // Son moderasyon olayları feed'ine düşsün — channelId bilinmiyor (auto-punish
  // flood threshold'ından tetiklendi; orijinal kanal tek bir olay değil, birden
  // çok ihlalin toplamı). userId dolu, channelId null (Faz A).
  try {
    await recordModStatEvent(serverId, 'auto_punish', { userId: targetUserId, channelId: null });
  } catch (err) {
    // Event yazımı best-effort — ceza zaten uygulandı, event fail olsa da sorun yok.
    console.warn('[auto-punish] event record fail:', err instanceof Error ? err.message : err);
  }

  return { applied: true, reason: 'applied', expiresAt };
}

import { Router, type Request, type Response } from 'express';
import { config } from '../config';
import { logAction } from '../services/auditLogService';
import { recordRoomActivityEventDirect } from '../services/roomActivityService';
import { queryOne } from '../repositories/db';
import { FLOOD_DEFAULTS, AUTOPUNISH_FLOOD_DEFAULT, type ModerationConfig } from '../services/moderationConfigService';
import { recordEvent, isValidKind, type ModKind } from '../services/moderationStatsService';
import { applyAutoPunishFlood } from '../services/moderationAutoPunishService';

const router = Router();

// Defense-in-depth: /internal/* yalnızca loopback'ten.
// Üretimde nginx dış erişimi keser; burada ikinci kilit.
function isLoopback(req: Request): boolean {
  const addr = req.socket?.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function requireInternal(req: Request, res: Response): boolean {
  if (!config.internalNotifySecret) {
    res.status(503).json({ error: 'internal_disabled' });
    return false;
  }
  if (!isLoopback(req)) {
    console.warn('[internal] non-loopback reddedildi');
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  const provided = req.headers['x-internal-secret'];
  if (provided !== config.internalNotifySecret) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

/**
 * POST /internal/audit — diğer servislerden (chat-server) audit yazma köprüsü.
 * Body kısıtlı: body text ASLA saklanmaz. `metadata` sadece metadata.
 * Üst katman chat-server kodunda; burası yalnızca shared-secret + loopback gate.
 */
router.post('/audit', async (req: Request, res: Response) => {
  if (!requireInternal(req, res)) return;

  const { serverId, actorId, action, resourceType, resourceId, metadata } = req.body ?? {};

  if (typeof actorId !== 'string' || !actorId) return res.status(400).json({ error: 'actorId required' });
  if (typeof action !== 'string' || !action) return res.status(400).json({ error: 'action required' });
  if (action.length > 64) return res.status(400).json({ error: 'action too long' });

  // Whitelist: chat-server yalnızca DM audit'i yazabilsin — yetki genişlemesin.
  if (!action.startsWith('dm.')) {
    return res.status(400).json({ error: 'action not permitted on this bridge' });
  }

  // Metadata sanity: 2 KB üst sınır, plain object, body metni asla yazma.
  let safeMetadata: Record<string, unknown> | undefined;
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      return res.status(400).json({ error: 'metadata must be object' });
    }
    const str = JSON.stringify(metadata);
    if (str.length > 2048) return res.status(400).json({ error: 'metadata too large' });
    safeMetadata = metadata as Record<string, unknown>;
  }

  try {
    await logAction({
      serverId: typeof serverId === 'string' && serverId ? serverId : null,
      actorId,
      action,
      resourceType: typeof resourceType === 'string' ? resourceType : undefined,
      resourceId: typeof resourceId === 'string' ? resourceId : undefined,
      metadata: safeMetadata,
    });
    res.status(204).end();
  } catch (err) {
    console.warn('[internal/audit] write failed', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'audit_failed' });
  }
});

/**
 * GET /internal/channel-flood-config?channelId=X
 *
 * chat-server'ın moderation (flood + profanity) için kullandığı config lookup köprüsü.
 * Endpoint adı geriye dönük uyumluluk için `flood-config` kalıyor; response artık profanity'yi de içeriyor.
 * Bilinmeyen channel veya null moderation_config → default flood + profanity disabled + serverId null.
 * Fail-safe: hata durumunda default + serverId null (chat-server built-in default kullanır).
 */

router.post('/room-activity', async (req: Request, res: Response) => {
  const secret = req.header('x-internal-secret') || '';
  if (!config.internalNotifySecret || secret !== config.internalNotifySecret) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const serverId = typeof body.serverId === 'string' ? body.serverId.trim() : '';
    const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!serverId || !channelId || !body.type || !label) {
      console.warn('[internal/room-activity] skipped invalid payload', {
        hasServer: !!serverId,
        hasChannel: !!channelId,
        hasType: !!body.type,
        hasLabel: !!label,
      });
      res.status(204).end();
      return;
    }

    await recordRoomActivityEventDirect({
      serverId,
      channelId,
      type: body.type,
      actorId: typeof body.actorId === 'string' ? body.actorId : null,
      targetUserId: typeof body.targetUserId === 'string' ? body.targetUserId : null,
      label,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    } as any);
    res.json({ ok: true });
  } catch (err) {
    console.warn('[internal/room-activity] write failed', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'room_activity_failed' });
  }
});

router.get('/channel-flood-config', async (req: Request, res: Response) => {
  if (!requireInternal(req, res)) return;

  const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : '';
  if (!channelId) return res.status(400).json({ error: 'channelId required' });

  try {
    const row = await queryOne<{ server_id: string; moderation_config: ModerationConfig | null }>(
      `SELECT c.server_id, s.moderation_config
       FROM channels c
       JOIN servers s ON s.id = c.server_id
       WHERE c.id = $1`,
      [channelId],
    );
    const defaultAutoPunish = { flood: AUTOPUNISH_FLOOD_DEFAULT };
    if (!row) {
      // Default AÇIK — kanal bilinmiyorsa bile sistem listesi çalışsın.
      return res.json({ serverId: null, flood: FLOOD_DEFAULTS, profanity: { enabled: true, words: [] }, spam: { enabled: true }, autoPunishment: defaultAutoPunish });
    }
    const flood = row.moderation_config?.flood;
    const profanity = row.moderation_config?.profanity;
    const spam = row.moderation_config?.spam;
    const apFlood = row.moderation_config?.autoPunishment?.flood;
    res.json({
      serverId: row.server_id,
      flood: {
        enabled:    flood?.enabled    ?? true,
        cooldownMs: flood?.cooldownMs ?? FLOOD_DEFAULTS.cooldownMs,
        limit:      flood?.limit      ?? FLOOD_DEFAULTS.limit,
        windowMs:   flood?.windowMs   ?? FLOOD_DEFAULTS.windowMs,
      },
      profanity: {
        // Sunucu sahibi açıkça kapatmadıysa varsayılan AÇIK.
        enabled: profanity?.enabled ?? true,
        words:   Array.isArray(profanity?.words) ? profanity.words : [],
      },
      spam: { enabled: spam?.enabled ?? true },
      autoPunishment: {
        flood: {
          enabled:         apFlood?.enabled         ?? AUTOPUNISH_FLOOD_DEFAULT.enabled,
          threshold:       apFlood?.threshold       ?? AUTOPUNISH_FLOOD_DEFAULT.threshold,
          windowMinutes:   apFlood?.windowMinutes   ?? AUTOPUNISH_FLOOD_DEFAULT.windowMinutes,
          action:          apFlood?.action          ?? AUTOPUNISH_FLOOD_DEFAULT.action,
          durationMinutes: apFlood?.durationMinutes ?? AUTOPUNISH_FLOOD_DEFAULT.durationMinutes,
        },
      },
    });
  } catch (err) {
    console.warn('[internal/channel-flood-config] err', err instanceof Error ? err.message : err);
    // Fail-safe: hata durumunda da sistem listesi aktif kalsın.
    res.json({ serverId: null, flood: FLOOD_DEFAULTS, profanity: { enabled: true, words: [] }, spam: { enabled: true }, autoPunishment: { flood: AUTOPUNISH_FLOOD_DEFAULT } });
  }
});

/**
 * POST /internal/moderation-stat-event
 * Body: { serverId: string, kind: 'flood'|'profanity'|'spam' }
 * chat-server block event'i için fire-and-forget hedef.
 */
router.post('/moderation-stat-event', async (req: Request, res: Response) => {
  if (!requireInternal(req, res)) return;
  const { serverId, kind, userId, channelId } = req.body ?? {};
  if (typeof serverId !== 'string' || !serverId) {
    return res.status(400).json({ error: 'serverId required' });
  }
  if (!isValidKind(kind)) {
    return res.status(400).json({ error: 'invalid kind' });
  }
  // userId/channelId opsiyonel (eski chat-server sürümleri için geriye uyum)
  const uid = typeof userId === 'string' && userId ? userId : null;
  const cid = typeof channelId === 'string' && channelId ? channelId : null;
  try {
    await recordEvent(serverId, kind as ModKind, { userId: uid, channelId: cid });
    res.status(204).end();
  } catch (err) {
    console.warn('[internal/moderation-stat-event] err', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'record_failed' });
  }
});

/**
 * POST /internal/auto-punish
 * Body: { serverId, userId, action: 'chat_timeout', durationMinutes }
 * chat-server flood threshold aşıldığında çağrılır. MVP yalnız 'chat_timeout'.
 * Guard'lar service içinde (owner/admin/mod skip, idempotent "zaten banlı" skip).
 */
router.post('/auto-punish', async (req: Request, res: Response) => {
  if (!requireInternal(req, res)) return;
  const { serverId, userId, action, durationMinutes } = req.body ?? {};

  if (typeof serverId !== 'string' || !serverId) {
    return res.status(400).json({ error: 'serverId required' });
  }
  if (typeof userId !== 'string' || !userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  if (action !== 'chat_timeout') {
    // MVP whitelist — kick/ban/voice mute ileride
    return res.status(400).json({ error: 'unsupported action' });
  }
  const dur = typeof durationMinutes === 'number' ? durationMinutes : NaN;
  if (!Number.isFinite(dur) || dur < 1 || dur > 1440) {
    return res.status(400).json({ error: 'invalid durationMinutes (1-1440)' });
  }

  try {
    const result = await applyAutoPunishFlood(serverId, userId, dur);
    // Debug log — sadece uygulandığında veya 'skipped_protected_role' durumunda.
    // skipped_already_banned sık gelebilir (cooldown race); log spam önlemek için sessiz.
    if (result.applied) {
      console.log('[auto-punish] applied', { durationMinutes: dur, hasExpiresAt: !!result.expiresAt });
    } else if (result.reason === 'skipped_protected_role') {
      console.log('[auto-punish] skipped protected role', { hasRole: !!result.role });
    }
    res.json(result);
  } catch (err) {
    console.warn('[auto-punish] err', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'punish_failed' });
  }
});

export default router;

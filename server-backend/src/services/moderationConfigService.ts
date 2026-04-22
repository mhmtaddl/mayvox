/**
 * Per-server moderation config (auto-mod).
 *
 * DB: servers.moderation_config JSONB — migration 025.
 * Yetki: SERVER_MODERATION_UPDATE (owner / admin / moderator).
 * chat-server bu config'i 30s TTL cache ile okur; per-server flood override uygular.
 *
 * Fail-safe: tüm alanlar optional. Eksik field → built-in default (chat-server tarafında).
 */
import { queryOne } from '../repositories/db';
import { AppError } from './serverService';
import { getServerAccessContext, assertCapability } from './accessContextService';
import { CAPABILITIES } from '../capabilities';
import { logAction } from './auditLogService';

export interface FloodConfig {
  cooldownMs: number;
  limit: number;
  windowMs: number;
}

export interface ModerationConfig {
  flood?: FloodConfig;
  // profanity + spam: ileride (Faz 3); şimdilik client "yakında" gösterir.
  profanity?: { enabled: boolean; words?: string[] };
  spam?: { enabled: boolean };
}

// Chat-server ile paylaşılan default. DB'de `{}` varsa bu devreye girer.
export const FLOOD_DEFAULTS: FloodConfig = {
  cooldownMs: 3000,
  limit: 5,
  windowMs: 5000,
};

// Strict range — UI slider/input limit'leri ile aynı.
const FLOOD_BOUNDS = {
  cooldownMs: { min: 1000, max: 60_000 },
  limit:      { min: 1,    max: 50 },
  windowMs:   { min: 1000, max: 60_000 },
};

function assertFiniteInt(v: unknown, name: string, { min, max }: { min: number; max: number }): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new AppError(400, `${name} tam sayı olmalı`);
  }
  if (v < min || v > max) {
    throw new AppError(400, `${name} ${min}-${max} aralığında olmalı`);
  }
  return v;
}

function validateFlood(input: unknown): FloodConfig {
  if (!input || typeof input !== 'object') {
    throw new AppError(400, 'flood config obje olmalı');
  }
  const o = input as Record<string, unknown>;
  return {
    cooldownMs: assertFiniteInt(o.cooldownMs, 'cooldownMs', FLOOD_BOUNDS.cooldownMs),
    limit:      assertFiniteInt(o.limit,      'limit',      FLOOD_BOUNDS.limit),
    windowMs:   assertFiniteInt(o.windowMs,   'windowMs',   FLOOD_BOUNDS.windowMs),
  };
}

/**
 * DB'deki ham config'i UI'a uygun merged şekilde döndür.
 * Eksik alanlar default ile doldurulur — frontend her zaman tam obje alır.
 */
export async function getServerModerationConfig(
  serverId: string,
  userId: string,
): Promise<{ flood: FloodConfig; profanity: { enabled: boolean; words: string[] }; spam: { enabled: boolean } }> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MODERATION_UPDATE, 'Moderation ayarlarını görme yetkin yok');

  const row = await queryOne<{ moderation_config: ModerationConfig }>(
    'SELECT moderation_config FROM servers WHERE id = $1',
    [serverId],
  );
  if (!row) throw new AppError(404, 'Sunucu bulunamadı');

  const cfg = row.moderation_config || {};
  return {
    flood: {
      cooldownMs: cfg.flood?.cooldownMs ?? FLOOD_DEFAULTS.cooldownMs,
      limit:      cfg.flood?.limit      ?? FLOOD_DEFAULTS.limit,
      windowMs:   cfg.flood?.windowMs   ?? FLOOD_DEFAULTS.windowMs,
    },
    profanity: {
      enabled: cfg.profanity?.enabled ?? false,
      words:   cfg.profanity?.words   ?? [],
    },
    spam: {
      enabled: cfg.spam?.enabled ?? false,
    },
  };
}

/**
 * Moderation config'i güncelle. Şu an sadece `flood` field'ı accept edilir;
 * profanity/spam gövdesi geldiğinde sessizce yoksayılır (ileri faz).
 */
export async function updateServerModerationConfig(
  serverId: string,
  userId: string,
  body: unknown,
): Promise<ModerationConfig> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MODERATION_UPDATE, 'Moderation ayarlarını değiştirme yetkin yok');

  if (!body || typeof body !== 'object') {
    throw new AppError(400, 'body obje olmalı');
  }
  const input = body as Record<string, unknown>;

  // Mevcut config'i al — partial update semantics.
  const row = await queryOne<{ moderation_config: ModerationConfig }>(
    'SELECT moderation_config FROM servers WHERE id = $1',
    [serverId],
  );
  if (!row) throw new AppError(404, 'Sunucu bulunamadı');

  const current: ModerationConfig = row.moderation_config || {};
  const next: ModerationConfig = { ...current };

  if ('flood' in input) {
    next.flood = validateFlood(input.flood);
  }
  // profanity/spam Faz 3'te açılacak; şu an patch no-op.

  await queryOne(
    'UPDATE servers SET moderation_config = $1 WHERE id = $2 RETURNING id',
    [JSON.stringify(next), serverId],
  );

  await logAction({
    serverId,
    actorId: userId,
    action: 'server.moderation_config.update',
    resourceType: 'server',
    resourceId: serverId,
    metadata: {
      fields: Object.keys(input),
      flood: next.flood ?? null,
    },
  });

  return next;
}

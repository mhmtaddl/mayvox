import { randomBytes, createHash } from 'crypto';
import { queryMany, queryOne, pool } from '../repositories/db';
import { AppError } from './serverService';
import { getServerAccessContext, assertCapability, invalidateAccessContext } from './accessContextService';
import { CAPABILITIES } from '../capabilities';
import { logAction } from './auditLogService';
import { assignSystemRoleToMember } from './roleSeedService';
import { assertLimit, getServerPlan, getPlanLimits, emitLimitHit } from './planService';

const TOKEN_BYTES = 24;            // 192-bit entropy
const TOKEN_BUF_BASE64URL_LEN = 32; // base64url(24 byte) = 32 karakter
const MAX_USES_CAP = 100;
const MAX_EXPIRES_DAYS = 30;
const DEFAULT_EXPIRES_DAYS = 7;
const DEFAULT_MAX_USES = 25;

export type InviteScope = 'server' | 'channel';

export interface InviteLinkInput {
  scope: InviteScope;
  channelId?: string | null;
  /** Tercih edilen yeni alan. Verilmezse default DEFAULT_EXPIRES_DAYS uygulanır. */
  expiresInDays?: number | null;
  /** Geriye uyumluluk — eski UI çağrıları. expiresInDays verilmediyse kullanılır. */
  expiresInHours?: number | null;
  /** Verilmezse default DEFAULT_MAX_USES uygulanır. */
  maxUses?: number | null;
}

export interface InviteLinkRow {
  id: string;
  server_id: string;
  channel_id: string | null;
  created_by: string;
  scope: InviteScope;
  token_hash: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  revoked_at: string | null;
  metadata: unknown;
  created_at: string;
}

export interface InviteLinkResponse {
  id: string;
  serverId: string;
  channelId: string | null;
  scope: InviteScope;
  createdBy: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  revokedAt: string | null;
  createdAt: string;
  state: InviteState;
}

export interface InviteLinkCreateResponse extends InviteLinkResponse {
  /** Raw token yalnızca oluşturma anında döner; bir daha asla. */
  token: string;
}

export interface InvitePreview {
  valid: boolean;
  serverId?: string;
  serverName?: string;
  scope?: InviteScope;
  channelId?: string | null;
  channelName?: string | null;
}

export type InviteState = 'active' | 'expired' | 'revoked' | 'exhausted';

// ── Token helpers ─────────────────────────────────────────────────────────

export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function normalizeToken(raw: unknown): string {
  if (typeof raw !== 'string') throw new AppError(400, 'Geçersiz davet bağlantısı');
  const trimmed = raw.trim();
  // Accept both just the token and full URLs (extract last path segment if URL)
  const lastSegment = trimmed.includes('/') ? trimmed.split('/').filter(Boolean).pop() ?? trimmed : trimmed;
  const maybeToken = lastSegment.split(/[?#]/, 1)[0] || lastSegment;
  if (maybeToken.length < TOKEN_BUF_BASE64URL_LEN - 4 || maybeToken.length > TOKEN_BUF_BASE64URL_LEN + 8) {
    throw new AppError(400, 'Geçersiz davet bağlantısı');
  }
  return maybeToken;
}

function computeState(row: InviteLinkRow): InviteState {
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return 'expired';
  if (row.max_uses !== null && row.used_count >= row.max_uses) return 'exhausted';
  return 'active';
}

function toResponse(row: InviteLinkRow): InviteLinkResponse {
  return {
    id: row.id,
    serverId: row.server_id,
    channelId: row.channel_id,
    scope: row.scope,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    state: computeState(row),
  };
}

// ── Create ────────────────────────────────────────────────────────────────

export async function createInviteLink(
  serverId: string,
  userId: string,
  input: InviteLinkInput,
): Promise<InviteLinkCreateResponse> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.INVITE_CREATE, 'Davet bağlantısı oluşturmak için yetkin yok');

  // Plan enforcement — günlük link invite limiti (mutation öncesi).
  await assertLimit(serverId, 'invite.createLink', userId);

  // Validation
  if (input.scope !== 'server' && input.scope !== 'channel') {
    throw new AppError(400, 'Geçersiz scope');
  }
  let channelId: string | null = null;
  if (input.scope === 'channel') {
    if (!input.channelId || typeof input.channelId !== 'string') {
      throw new AppError(400, 'Kanal ID gerekli');
    }
    const ch = await queryOne<{ id: string }>(
      'SELECT id FROM channels WHERE id = $1 AND server_id = $2',
      [input.channelId, serverId]
    );
    if (!ch) throw new AppError(404, 'Kanal bulunamadı');
    channelId = input.channelId;
  }

  // Süre çözümlemesi: expiresInDays > expiresInHours > default.
  // Sağlanmazsa default; sağlanırsa 30 günlük cap'e kadar kabul.
  let expiresHours: number;
  if (input.expiresInDays !== undefined && input.expiresInDays !== null) {
    const d = Number(input.expiresInDays);
    if (!Number.isFinite(d) || d <= 0) throw new AppError(400, 'Geçersiz süre');
    if (d > MAX_EXPIRES_DAYS) throw new AppError(400, `Süre en fazla ${MAX_EXPIRES_DAYS} gün olabilir`);
    expiresHours = d * 24;
  } else if (input.expiresInHours !== undefined && input.expiresInHours !== null) {
    const h = Number(input.expiresInHours);
    if (!Number.isFinite(h) || h <= 0) throw new AppError(400, 'Geçersiz süre');
    if (h > MAX_EXPIRES_DAYS * 24) throw new AppError(400, `Süre en fazla ${MAX_EXPIRES_DAYS} gün olabilir`);
    expiresHours = h;
  } else {
    expiresHours = DEFAULT_EXPIRES_DAYS * 24;
  }
  const expiresAt: string = new Date(Date.now() + expiresHours * 3600_000).toISOString();

  let maxUses: number;
  if (input.maxUses !== undefined && input.maxUses !== null) {
    const n = Number(input.maxUses);
    if (!Number.isInteger(n) || n <= 0) throw new AppError(400, 'Geçersiz kullanım limiti');
    if (n > MAX_USES_CAP) throw new AppError(400, `Kullanım limiti en fazla ${MAX_USES_CAP}`);
    maxUses = n;
  } else {
    maxUses = DEFAULT_MAX_USES;
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);

  const row = await queryOne<InviteLinkRow>(
    `INSERT INTO server_invite_links
       (server_id, channel_id, created_by, scope, token_hash, expires_at, max_uses)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [serverId, channelId, userId, input.scope, tokenHash, expiresAt, maxUses]
  );
  if (!row) throw new AppError(500, 'Davet oluşturulamadı');

  await logAction({
    serverId, actorId: userId, action: 'invite.create',
    resourceType: 'invite-link', resourceId: row.id,
    metadata: { scope: input.scope, channelId, expiresAt, maxUses },
  });

  return { ...toResponse(row), token: rawToken };
}

// ── List ──────────────────────────────────────────────────────────────────

export interface ListOptions {
  channelId?: string;
  includeInactive?: boolean;
}

export async function listInviteLinks(
  serverId: string,
  userId: string,
  opts: ListOptions = {},
): Promise<InviteLinkResponse[]> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.INVITE_CREATE, 'Davet bağlantılarını görmek için yetkin yok');

  const params: unknown[] = [serverId];
  let where = 'server_id = $1';
  if (opts.channelId) {
    params.push(opts.channelId);
    where += ` AND channel_id = $${params.length}`;
  }
  if (!opts.includeInactive) {
    where += ` AND revoked_at IS NULL`
      + ` AND (expires_at IS NULL OR expires_at > now())`
      + ` AND (max_uses IS NULL OR used_count < max_uses)`;
  }

  const rows = await queryMany<InviteLinkRow>(
    `SELECT * FROM server_invite_links WHERE ${where} ORDER BY created_at DESC LIMIT 50`,
    params
  );
  return rows.map(toResponse);
}

// ── Revoke ────────────────────────────────────────────────────────────────

export async function revokeInviteLink(
  serverId: string,
  userId: string,
  inviteId: string,
): Promise<void> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.INVITE_REVOKE, 'Davet iptal etmek için yetkin yok');

  const result = await pool.query(
    `UPDATE server_invite_links SET revoked_at = now()
     WHERE id = $1 AND server_id = $2 AND revoked_at IS NULL`,
    [inviteId, serverId]
  );
  if (result.rowCount === 0) throw new AppError(404, 'Davet bulunamadı veya zaten iptal edilmiş');

  await logAction({
    serverId, actorId: userId, action: 'invite.revoke',
    resourceType: 'invite-link', resourceId: inviteId,
  });
}

// ── Preview ───────────────────────────────────────────────────────────────

export async function previewInviteLink(rawTokenInput: string): Promise<InvitePreview> {
  let token: string;
  try { token = normalizeToken(rawTokenInput); }
  catch { return { valid: false }; }

  const hash = hashInviteToken(token);
  const row = await queryOne<{
    server_id: string; channel_id: string | null; scope: InviteScope;
    expires_at: string | null; revoked_at: string | null; max_uses: number | null; used_count: number;
    server_name: string; channel_name: string | null;
  }>(
    `SELECT l.server_id, l.channel_id, l.scope, l.expires_at, l.revoked_at, l.max_uses, l.used_count,
            s.name AS server_name, c.name AS channel_name
     FROM server_invite_links l
     JOIN servers s ON s.id = l.server_id
     LEFT JOIN channels c ON c.id = l.channel_id
     WHERE l.token_hash = $1`,
    [hash]
  );
  if (!row) return { valid: false };

  const state = computeState({
    id: '', server_id: row.server_id, channel_id: row.channel_id, created_by: '',
    scope: row.scope, token_hash: '', expires_at: row.expires_at,
    max_uses: row.max_uses, used_count: row.used_count, revoked_at: row.revoked_at,
    metadata: null, created_at: '',
  });
  if (state !== 'active') return { valid: false };

  return {
    valid: true,
    serverId: row.server_id,
    serverName: row.server_name,
    scope: row.scope,
    channelId: row.channel_id,
    channelName: row.channel_name,
  };
}

// ── Accept ────────────────────────────────────────────────────────────────

export interface InviteAcceptResult {
  scope: InviteScope;
  serverId: string;
  channelId: string | null;
  /** Kullanıcı zaten üye/erişimli ise no-op — frontend aynı ekrana yönlendirir. */
  alreadyApplied: boolean;
}

const GENERIC_INVALID = 'Davet bağlantısı geçersiz veya süresi dolmuş';

export async function acceptInviteLink(userId: string, rawTokenInput: string): Promise<InviteAcceptResult> {
  let token: string;
  try { token = normalizeToken(rawTokenInput); }
  catch { throw new AppError(400, GENERIC_INVALID); }

  const hash = hashInviteToken(token);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Row-level lock — concurrent accept'lerde used_count race'i engelle
    const { rows } = await client.query<InviteLinkRow>(
      `SELECT * FROM server_invite_links WHERE token_hash = $1 FOR UPDATE`,
      [hash]
    );
    const row = rows[0];
    // State enumeration ekstra mesaj sızdırmayı önle — tek generic mesaj.
    if (!row) { await client.query('ROLLBACK'); throw new AppError(404, GENERIC_INVALID); }
    const state = computeState(row);
    if (state !== 'active') { await client.query('ROLLBACK'); throw new AppError(400, GENERIC_INVALID); }

    // Ban kontrolü
    const banned = await client.query<{ id: string }>(
      'SELECT id FROM server_bans WHERE server_id = $1 AND user_id = $2',
      [row.server_id, userId]
    );
    if (banned.rows[0]) { await client.query('ROLLBACK'); throw new AppError(403, 'Bu sunucuya erişimin kısıtlanmış'); }

    let alreadyApplied = false;

    if (row.scope === 'server') {
      // Zaten üye mi?
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2',
        [row.server_id, userId]
      );
      if (existing.rows[0]) {
        alreadyApplied = true;
      } else {
        // Kapasite kontrolü: Math.min(servers.capacity, plan.maxMembers).
        // Race overshoot guard: servers row FOR UPDATE — concurrent join'ler serileşir.
        const cap = await client.query<{ member_count: number; capacity: number }>(
          `SELECT COALESCE(sa.member_count, 0) AS member_count, s.capacity
           FROM servers s LEFT JOIN server_activity sa ON sa.server_id = s.id
           WHERE s.id = $1 FOR UPDATE OF s`,
          [row.server_id]
        );
        const c = cap.rows[0];
        if (c) {
          const plan = await getServerPlan(row.server_id);
          const maxMembers = getPlanLimits(plan).maxMembers;
          const effectiveLimit = Math.min(c.capacity, maxMembers);
          if (c.member_count >= effectiveLimit) {
            await emitLimitHit(row.server_id, userId, 'server.join', plan, c.member_count, effectiveLimit);
            await client.query('ROLLBACK');
            throw new AppError(403, 'Sunucu kapasitesi dolu');
          }
        }
        // ON CONFLICT DO NOTHING — race koşulunda duplicate INSERT hata üretmesin.
        const ins = await client.query(
          `INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, $3)
           ON CONFLICT (server_id, user_id) DO NOTHING`,
          [row.server_id, userId, 'member']
        );
        if (ins.rowCount === 0) {
          // Başka request bizden önce üye eklemiş — idempotent.
          alreadyApplied = true;
        } else {
          await client.query(
            `UPDATE server_activity SET member_count = member_count + 1, updated_at = now()
             WHERE server_id = $1`,
            [row.server_id]
          );
          await assignSystemRoleToMember(client, row.server_id, userId, 'member');
        }
      }
    } else if (row.scope === 'channel' && row.channel_id) {
      // Kanal scope: önce sunucu üyesi olmalı
      const memberRow = await client.query<{ id: string }>(
        'SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2',
        [row.server_id, userId]
      );
      if (!memberRow.rows[0]) {
        await client.query('ROLLBACK');
        throw new AppError(403, 'Önce sunucuya katılmalısın');
      }
      // Mevcut grant var mı?
      const existingGrant = await client.query<{ channel_id: string }>(
        'SELECT channel_id FROM channel_access WHERE channel_id = $1 AND user_id = $2',
        [row.channel_id, userId]
      );
      if (existingGrant.rows[0]) {
        alreadyApplied = true;
      } else {
        await client.query(
          `INSERT INTO channel_access (channel_id, user_id, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [row.channel_id, userId, row.created_by]
        );
      }
    }

    // Yeni kabul gerçekleştiyse used_count artır
    if (!alreadyApplied) {
      await client.query(
        `UPDATE server_invite_links SET used_count = used_count + 1 WHERE id = $1`,
        [row.id]
      );
    }

    // Audit same transaction — mutation ile tutarlı
    await logAction({
      serverId: row.server_id,
      actorId: userId,
      action: 'invite.accept',
      resourceType: 'invite-link',
      resourceId: row.id,
      metadata: { scope: row.scope, channelId: row.channel_id, alreadyApplied },
    }, client);

    await client.query('COMMIT');

    // Access context cache invalidate (yeni üye/erişim)
    invalidateAccessContext(userId, row.server_id);

    return {
      scope: row.scope,
      serverId: row.server_id,
      channelId: row.channel_id,
      alreadyApplied,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* no-op */ }
    throw err instanceof AppError ? err : new AppError(500, 'Davet kabul edilemedi');
  } finally {
    client.release();
  }
}

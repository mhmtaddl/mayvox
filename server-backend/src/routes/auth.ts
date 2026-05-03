import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { changeEmail, changePassword, login, me, register, updateProfile, AuthError } from '../services/authService';
import { authMiddleware } from '../middleware/auth';
import { execute, pool, queryMany, queryOne } from '../repositories/db';
import * as channelService from '../services/channelService';
import { postBroadcast } from '../services/channelBroadcast';
import { evaluateChannelAccess } from '../services/channelAccessService';
import { getServerAccessContext } from '../services/accessContextService';
import { CAPABILITIES } from '../capabilities';

const router = Router();

const AVATAR_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function avatarExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function inviteCode(): string {
  return crypto.randomBytes(5).toString('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
}

function inviteRequestDto(row: any) {
  if (!row) return null;
  const expires = row.expires_at != null ? Number(row.expires_at) : null;
  const expired = expires != null && expires <= Date.now();
  const rejectionCount = Number(row.rejection_count || 0);
  const blockedUntil = row.blocked_until != null ? Number(row.blocked_until) : null;
  return {
    id: row.id,
    email: row.email,
    status: expired && row.status === 'approved' ? 'expired' : row.status,
    code: row.code ?? row.approved_invite_code ?? null,
    expires_at: expires,
    created_at: row.created_at,
    rejection_count: rejectionCount,
    blocked_until: blockedUntil,
    permanently_blocked: !!row.permanently_blocked,
    last_send_error: row.last_send_error ?? null,
  };
}

async function requireProfileAdmin(userId: string, primaryOnly = false): Promise<void> {
  const row = await queryOne<{ is_admin: boolean | null; is_primary_admin: boolean | null; role: string | null }>(
    'SELECT is_admin, is_primary_admin, role FROM profiles WHERE id = $1',
    [userId],
  );
  const isPrimary = !!row?.is_primary_admin || row?.role === 'system_admin';
  const isAdmin = isPrimary || !!row?.is_admin;
  if (primaryOnly ? !isPrimary : !isAdmin) throw new AuthError(403, 'Admin yetkisi gerekli');
}

async function requireRoomMessageAccess(channelId: string, userId: string, write = false): Promise<{ serverId: string }> {
  const channel = await queryOne<{ id: string; server_id: string }>(
    'SELECT id, server_id FROM channels WHERE id = $1',
    [channelId],
  );
  if (!channel) throw new AuthError(404, 'Kanal bulunamadı');

  const access = await evaluateChannelAccess(channel.server_id, channelId, userId);
  if (write ? !access.canJoin : !access.canSee) throw new AuthError(403, 'Kanal erişimi yok');

  if (write) {
    const member = await queryOne<{ chat_banned_by: string | null; chat_ban_expires_at: string | null }>(
      'SELECT chat_banned_by, chat_ban_expires_at::text FROM server_members WHERE server_id = $1 AND user_id = $2',
      [channel.server_id, userId],
    );
    const banned = !!member?.chat_banned_by
      && (!member.chat_ban_expires_at || new Date(member.chat_ban_expires_at).getTime() > Date.now());
    if (banned) throw new AuthError(403, 'Bu sunucuda mesaj gönderme yasağın var');
  }

  return { serverId: channel.server_id };
}

async function canModerateRoomMessages(serverId: string, userId: string): Promise<boolean> {
  const ctx = await getServerAccessContext(userId, serverId);
  return ctx.capabilities.includes(CAPABILITIES.MEMBER_CHAT_BAN) || ctx.flags.canManageServer || ctx.flags.canUpdateChannel;
}

function handleAuthError(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err && typeof err === 'object' && typeof (err as any).status === 'number') {
    res.status((err as any).status).json({ error: (err as any).message || 'İstek işlenemedi' });
    return;
  }
  console.error('[auth route] unexpected error', err);
  res.status(500).json({ error: 'Sunucu hatası' });
}

router.post('/login', async (req: Request, res: Response) => {
  try {
    const result = await login(req.body?.identifier, req.body?.password);
    res.json(result);
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/me', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const result = await me((req as any).user);
    res.json(result);
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const result = await register({
      email: req.body?.email,
      username: req.body?.username,
      password: req.body?.password,
      displayName: req.body?.displayName,
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      age: req.body?.age,
      avatar: req.body?.avatar,
    });
    res.status(201).json(result);
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/invite/request', async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.json({ error: 'invalid_email' });
      return;
    }
    const ban = await queryOne<{ email: string; rejection_count: number; blocked_until: string | number | null; permanently_blocked: boolean }>(
      'SELECT email, rejection_count, blocked_until, permanently_blocked FROM invite_email_bans WHERE email = $1',
      [email],
    );
    if (ban?.permanently_blocked) {
      res.json({ error: 'permanently_blocked', rejection_count: ban.rejection_count, permanently_blocked: true });
      return;
    }
    if (ban?.blocked_until != null && Number(ban.blocked_until) > Date.now()) {
      res.json({ error: 'temporarily_blocked', rejection_count: ban.rejection_count, blocked_until: Number(ban.blocked_until) });
      return;
    }
    const existing = await queryOne<any>(
      `SELECT ir.*, b.rejection_count, b.blocked_until, b.permanently_blocked
         FROM invite_requests ir
         LEFT JOIN invite_email_bans b ON lower(b.email) = lower(ir.email)
        WHERE lower(ir.email) = lower($1)
          AND ir.status IN ('pending','sending','failed','approved')
        ORDER BY ir.created_at DESC
        LIMIT 1`,
      [email],
    );
    if (existing) {
      const dto = inviteRequestDto(existing)!;
      res.json({
        error: 'already_pending',
        request_id: dto.id,
        status: dto.status,
        expires_at: dto.expires_at,
        rejection_count: dto.rejection_count,
        blocked_until: dto.blocked_until,
        permanently_blocked: dto.permanently_blocked,
      });
      return;
    }
    const row = await queryOne<any>(
      `INSERT INTO invite_requests (email, status)
       VALUES ($1, 'pending')
       RETURNING *`,
      [email],
    );
    res.json({ ok: true, request_id: row.id, status: row.status });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/invite/request/:id', async (req: Request, res: Response) => {
  try {
    const row = await queryOne<any>(
      `SELECT ir.*, b.rejection_count, b.blocked_until, b.permanently_blocked
         FROM invite_requests ir
         LEFT JOIN invite_email_bans b ON lower(b.email) = lower(ir.email)
        WHERE ir.id::text = $1
        LIMIT 1`,
      [req.params.id],
    );
    if (!row) {
      res.json({ error: 'not_found' });
      return;
    }
    res.json(inviteRequestDto(row));
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/invite/verify', async (req: Request, res: Response) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const email = normalizeEmail(req.body?.email);
    const row = await queryOne<{ code: string }>(
      `SELECT code FROM invite_codes
        WHERE code = $1
          AND COALESCE(used, false) = false
          AND revoked_at IS NULL
          AND (email IS NULL OR lower(email) = lower($2))
          AND (expires_at IS NULL OR expires_at::bigint > $3)
        LIMIT 1`,
      [code, email, Date.now()],
    );
    res.json({ ok: !!row });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/invite/use', async (req: Request, res: Response) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const email = normalizeEmail(req.body?.email);
    const updated = await execute(
      `UPDATE invite_codes
          SET used = true, used_by_email = $2, used_at = now()
        WHERE code = $1
          AND COALESCE(used, false) = false
          AND revoked_at IS NULL
          AND (email IS NULL OR lower(email) = lower($2))
          AND (expires_at IS NULL OR expires_at::bigint > $3)`,
      [code, email, Date.now()],
    );
    if (updated) {
      await execute(
        `UPDATE invite_requests
            SET status = 'used', updated_at = now()
          WHERE lower(email) = lower($1) AND code = $2`,
        [email, code],
      );
    }
    res.json({ ok: updated > 0 });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/profiles/by-username/:username', async (req: Request, res: Response) => {
  try {
    const username = String(req.params.username || '').trim();
    const row = await queryOne(
      `SELECT *
         FROM profiles
        WHERE lower(name) = lower($1)
        LIMIT 1`,
      [username],
    );
    res.json({ data: row ?? null, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/profiles', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
    const rows = ids.length
      ? await queryMany('SELECT * FROM profiles WHERE id::text = ANY($1::text[]) ORDER BY name', [Array.from(new Set(ids))])
      : await queryMany('SELECT * FROM profiles ORDER BY name');
    res.json({ data: rows, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/change-password', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await changePassword((req as any).user, req.body?.password);
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/channels/:channelId/verify-password', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const ok = await channelService.verifyChannelPassword(
      req.params.channelId as string,
      (req as any).userId,
      req.body?.password,
    );
    res.json({ data: ok, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.patch('/channels/:channelId/password', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const result = await channelService.setChannelPassword(
      req.params.channelId as string,
      (req as any).userId,
      req.body?.password ?? null,
    );
    res.json({ data: result, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/channels/:channelId', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const channel = await queryOne<{ id: string; server_id: string }>(
      'SELECT id, server_id FROM channels WHERE id = $1',
      [req.params.channelId],
    );
    if (!channel) throw new AuthError(404, 'Kanal bulunamadı');
    await channelService.deleteChannel(channel.server_id, (req as any).userId, req.params.channelId as string);
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/users/:id', authMiddleware as any, async (req: Request, res: Response) => {
  const actorId = (req as any).profileId as string;
  const targetId = req.params.id as string;
  const client = await pool.connect();
  try {
    await requireProfileAdmin(actorId, true);
    if (actorId === targetId) throw new AuthError(400, 'Kendi hesabını buradan silemezsin');

    await client.query('BEGIN');
    const target = await client.query<{ id: string; is_primary_admin: boolean | null; role: string | null }>(
      'SELECT id, is_primary_admin, role FROM profiles WHERE id = $1 FOR UPDATE',
      [targetId],
    );
    if (!target.rows[0]) throw new AuthError(404, 'Kullanıcı bulunamadı');
    if (target.rows[0].is_primary_admin || target.rows[0].role === 'system_admin') {
      throw new AuthError(403, 'Primary admin hesabı silinemez');
    }

    const owned = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM servers WHERE owner_user_id = $1 OR owner_id = $1',
      [targetId],
    );
    if (Number(owned.rows[0]?.count || 0) > 0) {
      throw new AuthError(409, 'Kullanıcının sahibi olduğu sunucu var; önce sunucu sahipliğini taşı');
    }

    await client.query('UPDATE room_messages SET sender_id = NULL WHERE sender_id = $1', [targetId]);
    await client.query('UPDATE channels SET owner_id = NULL WHERE owner_id = $1', [targetId]);
    await client.query('UPDATE invite_codes SET used_by_user_id = NULL WHERE used_by_user_id = $1', [targetId]);
    await client.query('UPDATE invite_requests SET reviewed_by = NULL WHERE reviewed_by = $1', [targetId]);
    await client.query('UPDATE invite_requests SET sent_by = NULL WHERE sent_by = $1', [targetId]);
    await client.query('UPDATE access_requests SET reviewed_by = NULL WHERE reviewed_by = $1', [targetId]);
    await client.query('UPDATE server_join_requests SET reviewed_by = NULL WHERE reviewed_by = $1', [targetId]);
    await client.query('UPDATE server_members SET voice_muted_by = NULL WHERE voice_muted_by = $1::text', [targetId]);
    await client.query('UPDATE server_members SET timeout_set_by = NULL WHERE timeout_set_by = $1::text', [targetId]);
    await client.query('UPDATE server_members SET chat_banned_by = NULL WHERE chat_banned_by = $1::text', [targetId]);

    await client.query('DELETE FROM friend_group_members WHERE owner_id = $1 OR friend_user_id = $1', [targetId]);
    await client.query('DELETE FROM friend_groups WHERE owner_id = $1', [targetId]);
    await client.query('DELETE FROM friend_favorites WHERE owner_id = $1 OR friend_user_id = $1', [targetId]);
    await client.query('DELETE FROM friend_requests WHERE sender_id = $1 OR receiver_id = $1', [targetId]);
    await client.query('DELETE FROM friendships WHERE user_low_id = $1 OR user_high_id = $1', [targetId]);
    await client.query('DELETE FROM server_join_requests WHERE user_id = $1', [targetId]);
    await client.query('DELETE FROM server_user_invites WHERE invited_user_id = $1 OR inviter_user_id = $1 OR invited_by = $1', [targetId]);
    await client.query('DELETE FROM server_members WHERE user_id = $1', [targetId]);
    await client.query('DELETE FROM member_roles WHERE user_id = $1::text', [targetId]);
    await client.query('DELETE FROM channel_access WHERE user_id = $1::text', [targetId]);
    await client.query('DELETE FROM server_bans WHERE user_id = $1::text', [targetId]);
    await client.query('DELETE FROM server_invites WHERE created_by_user_id = $1::text', [targetId]);
    await client.query('DELETE FROM server_invite_links WHERE created_by = $1::text', [targetId]);
    await client.query('DELETE FROM moderation_stats WHERE user_id = $1::text', [targetId]);
    await client.query('DELETE FROM user_settings WHERE user_id = $1', [targetId]);
    await client.query('DELETE FROM voice_sessions WHERE user_id = $1', [targetId]);

    const deleted = await client.query('DELETE FROM profiles WHERE id = $1', [targetId]);
    await client.query('DELETE FROM auth.users WHERE id = $1', [targetId]);
    await client.query('COMMIT');
    res.json({ data: { ok: (deleted.rowCount || 0) > 0 }, error: null });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* no-op */ }
    handleAuthError(res, err);
  } finally {
    client.release();
  }
});

router.post('/change-email', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await changeEmail((req as any).user, req.body?.email);
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.patch('/profile', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    res.json(await updateProfile((req as any).user, req.body || {}));
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/avatar', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const profileId = (req as any).profileId as string;
    const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType : '';
    const data = typeof req.body?.data === 'string' ? req.body.data : '';
    if (!AVATAR_CONTENT_TYPES.has(contentType) || !data) throw new AuthError(400, 'Geçersiz fotoğraf dosyası');

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) throw new AuthError(400, 'Fotoğraf dosyası çok büyük');

    const dir = path.join(process.cwd(), 'uploads', 'avatars', profileId);
    const fileName = `avatar-${Date.now()}.${avatarExtension(contentType)}`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), buffer);

    const avatar = `/uploads/avatars/${profileId}/${fileName}`;
    const result = await updateProfile((req as any).user, { avatar });
    res.json({ url: avatar, user: result.user });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/settings', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const profileId = (req as any).profileId as string;
    const row = await queryOne(
      `SELECT user_id, theme_key, accent_palette, background_key, mic_mode, afk_timeout_seconds, created_at, updated_at
         FROM user_settings
        WHERE user_id = $1`,
      [profileId],
    );
    res.json({ data: row ?? null, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.patch('/settings', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const profileId = (req as any).profileId as string;
    const input = req.body && typeof req.body === 'object' ? req.body : {};
    const themeKey = typeof input.theme_key === 'string'
      ? input.theme_key
      : typeof input.theme === 'string'
        ? input.theme
        : null;
    const accentPalette = typeof input.accent_palette === 'string' ? input.accent_palette : null;
    const backgroundKey = typeof input.background_key === 'string' ? input.background_key : null;
    const micMode = typeof input.mic_mode === 'string' ? input.mic_mode : null;
    const afkTimeout = Number.isFinite(Number(input.afk_timeout_seconds))
      ? Math.trunc(Number(input.afk_timeout_seconds))
      : null;
    const row = await queryOne(
      `INSERT INTO user_settings (user_id, theme_key, accent_palette, background_key, mic_mode, afk_timeout_seconds, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id) DO UPDATE SET
         theme_key = COALESCE(EXCLUDED.theme_key, user_settings.theme_key),
         accent_palette = COALESCE(EXCLUDED.accent_palette, user_settings.accent_palette),
         background_key = COALESCE(EXCLUDED.background_key, user_settings.background_key),
         mic_mode = COALESCE(EXCLUDED.mic_mode, user_settings.mic_mode),
         afk_timeout_seconds = COALESCE(EXCLUDED.afk_timeout_seconds, user_settings.afk_timeout_seconds),
         updated_at = now()
       RETURNING user_id, theme_key, accent_palette, background_key, mic_mode, afk_timeout_seconds, created_at, updated_at`,
      [profileId, themeKey, accentPalette, backgroundKey, micMode, afkTimeout],
    );
    res.json({ data: row, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/friends', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).profileId as string;
    const friends = await queryMany(
      'SELECT user_low_id, user_high_id, created_at FROM friendships WHERE user_low_id = $1 OR user_high_id = $1',
      [userId],
    );
    const requests = await queryMany(
      `SELECT id, sender_id, receiver_id, status, created_at, updated_at
         FROM friend_requests
        WHERE status = 'pending' AND (sender_id = $1 OR receiver_id = $1)
        ORDER BY created_at DESC`,
      [userId],
    );
    res.json({ friends, requests });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/friends/requests', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const senderId = (req as any).profileId as string;
    const receiverId = String(req.body?.receiverId || '');
    if (!receiverId || receiverId === senderId) throw new AuthError(400, 'Geçersiz kullanıcı');
    const [low, high] = senderId < receiverId ? [senderId, receiverId] : [receiverId, senderId];
    const existingFriend = await queryOne('SELECT 1 FROM friendships WHERE user_low_id = $1 AND user_high_id = $2', [low, high]);
    if (existingFriend) throw new AuthError(409, 'Zaten arkadaşsınız');
    const row = await queryOne(
      `INSERT INTO friend_requests (sender_id, receiver_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT DO NOTHING
       RETURNING id, sender_id, receiver_id, status, created_at`,
      [senderId, receiverId],
    );
    void postBroadcast('friend-update', { eventType: 'INSERT', userIds: [senderId, receiverId], row });
    res.status(201).json({ data: row, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.patch('/friends/requests/:id', authMiddleware as any, async (req: Request, res: Response) => {
  const userId = (req as any).profileId as string;
  const client = await pool.connect();
  try {
    const status = req.body?.status === 'accepted' ? 'accepted' : 'rejected';
    await client.query('BEGIN');
    const request = await client.query<{ id: string; sender_id: string; receiver_id: string; status: string; created_at: string }>(
      `UPDATE friend_requests
          SET status = $2, updated_at = now()
        WHERE id::text = $1 AND receiver_id = $3 AND status = 'pending'
        RETURNING id, sender_id, receiver_id, status, created_at`,
      [req.params.id, status, userId],
    );
    const row = request.rows[0];
    if (!row) throw new AuthError(404, 'İstek bulunamadı');
    if (status === 'accepted') {
      const [low, high] = row.sender_id < row.receiver_id
        ? [row.sender_id, row.receiver_id]
        : [row.receiver_id, row.sender_id];
      await client.query(
        `INSERT INTO friendships (user_low_id, user_high_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [low, high],
      );
    }
    await client.query('COMMIT');
    void postBroadcast('friend-update', { eventType: 'UPDATE', userIds: [row.sender_id, row.receiver_id], row });
    res.json({ data: row, error: null });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* no-op */ }
    handleAuthError(res, err);
  } finally {
    client.release();
  }
});

router.delete('/friends/:otherId', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).profileId as string;
    const otherId = req.params.otherId as string;
    const [low, high] = userId < otherId ? [userId, otherId] : [otherId, userId];
    await execute('DELETE FROM friendships WHERE user_low_id = $1 AND user_high_id = $2', [low, high]);
    void postBroadcast('friend-update', { eventType: 'DELETE', userIds: [userId, otherId], row: { user_low_id: low, user_high_id: high } });
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/friends/favorites', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const rows = await queryMany(
      'SELECT friend_user_id, created_at FROM friend_favorites WHERE owner_id = $1 ORDER BY created_at DESC',
      [(req as any).profileId],
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/friends/favorites', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).profileId as string;
    const friendId = String(req.body?.friendId || '');
    if (!friendId || friendId === ownerId) throw new AuthError(400, 'Geçersiz kullanıcı');
    await execute(
      `INSERT INTO friend_favorites (owner_id, friend_user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [ownerId, friendId],
    );
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/friends/favorites/:friendId', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await execute('DELETE FROM friend_favorites WHERE owner_id = $1 AND friend_user_id = $2', [(req as any).profileId, req.params.friendId]);
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/friends/groups', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).profileId as string;
    const groups = await queryMany(
      'SELECT id, name, sort_order FROM friend_groups WHERE owner_id = $1 ORDER BY sort_order, created_at',
      [userId],
    );
    const members = await queryMany(
      'SELECT group_id, friend_user_id FROM friend_group_members WHERE owner_id = $1',
      [userId],
    );
    res.json({ groups, members });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/friends/groups', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).profileId as string;
    const name = String(req.body?.name || '').trim();
    if (!name) throw new AuthError(400, 'Grup adı gerekli');
    const row = await queryOne(
      `INSERT INTO friend_groups (owner_id, name, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, sort_order`,
      [ownerId, name, Math.trunc(Number(req.body?.sortOrder || 0))],
    );
    res.status(201).json({ data: row, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.patch('/friends/groups/:id', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const row = await queryOne(
      `UPDATE friend_groups SET name = $1 WHERE id::text = $2 AND owner_id = $3 RETURNING id, name, sort_order`,
      [String(req.body?.name || '').trim(), req.params.id, (req as any).profileId],
    );
    if (!row) throw new AuthError(404, 'Grup bulunamadı');
    res.json({ data: row, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/friends/groups/:id', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await execute('DELETE FROM friend_groups WHERE id::text = $1 AND owner_id = $2', [req.params.id, (req as any).profileId]);
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.put('/friends/groups/members', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).profileId as string;
    const friendId = String(req.body?.friendId || '');
    const groupId = String(req.body?.groupId || '');
    if (!friendId || !groupId) throw new AuthError(400, 'Eksik veri');
    await execute('DELETE FROM friend_group_members WHERE owner_id = $1 AND friend_user_id = $2', [ownerId, friendId]);
    await execute(
      `INSERT INTO friend_group_members (group_id, friend_user_id, owner_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [groupId, friendId, ownerId],
    );
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/friends/groups/members/:friendId', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await execute('DELETE FROM friend_group_members WHERE owner_id = $1 AND friend_user_id = $2', [(req as any).profileId, req.params.friendId]);
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.patch('/users/:id/moderation', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).profileId as string;
    const targetId = req.params.id as string;
    const updates = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const roleKeys = ['is_admin', 'is_primary_admin', 'is_moderator'];
    const hasRoleChange = roleKeys.some(k => k in updates);
    await requireProfileAdmin(actorId, hasRoleChange);

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const bools = ['is_admin', 'is_primary_admin', 'is_moderator', 'is_muted', 'is_voice_banned'];
    for (const key of bools) {
      if (key in updates) {
        sets.push(`${key} = $${i++}`);
        values.push(!!updates[key]);
      }
    }
    if ('mute_expires' in updates) {
      sets.push(`mute_expires = $${i++}`);
      values.push(updates.mute_expires == null ? null : Math.trunc(Number(updates.mute_expires)));
    }
    if ('ban_expires' in updates) {
      sets.push(`ban_expires = $${i++}`);
      values.push(updates.ban_expires == null ? null : Math.trunc(Number(updates.ban_expires)));
    }
    if (!sets.length) {
      res.json({ data: { ok: true }, error: null });
      return;
    }
    sets.push('updated_at = now()');
    values.push(targetId);
    const updated = await execute(`UPDATE profiles SET ${sets.join(', ')} WHERE id = $${i}`, values);
    if (!updated) throw new AuthError(404, 'Kullanıcı bulunamadı');
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.patch('/users/:id/server-creation-plan', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).profileId as string;
    await requireProfileAdmin(actorId);
    const targetId = req.params.id as string;
    const plan = req.body?.plan;
    if (plan !== 'none' && plan !== 'free' && plan !== 'pro' && plan !== 'ultra') {
      throw new AuthError(400, 'Plan geçersiz');
    }
    const updated = await execute(
      `UPDATE profiles
          SET server_creation_plan = $1,
              server_creation_plan_source = 'manual',
              server_creation_plan_start = now(),
              server_creation_plan_end = NULL,
              updated_at = now()
        WHERE id = $2`,
      [plan, targetId],
    );
    if (!updated) throw new AuthError(404, 'Kullanıcı bulunamadı');
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/announcements', async (_req: Request, res: Response) => {
  try {
    const rows = await queryMany(
      `SELECT *
         FROM announcements
        WHERE is_active = true
        ORDER BY is_pinned DESC, created_at DESC`,
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/announcements', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).profileId as string;
    await requireProfileAdmin(actorId);
    const input = req.body && typeof req.body === 'object' ? req.body : {};
    const title = String(input.title || '').trim();
    const content = String(input.content || '').trim();
    if (!title || !content) throw new AuthError(400, 'Başlık ve içerik gerekli');
    const actor = await queryOne<{ display_name: string | null; name: string | null; email: string | null }>(
      'SELECT display_name, name, email FROM profiles WHERE id = $1',
      [actorId],
    );
    const row = await queryOne(
      `INSERT INTO announcements (
         id, title, content, author_id, author_name, is_pinned, priority, is_active,
         type, event_date, participation_time, participation_requirements, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, now(), now())
       RETURNING *`,
      [
        crypto.randomUUID(),
        title,
        content,
        actorId,
        String(input.author_name || actor?.display_name || actor?.name || actor?.email || 'Admin').trim(),
        !!input.is_pinned,
        ['normal', 'important', 'critical'].includes(String(input.priority)) ? String(input.priority) : 'normal',
        input.type === 'event' ? 'event' : 'announcement',
        input.event_date ? new Date(String(input.event_date)).toISOString() : null,
        input.participation_time == null ? null : String(input.participation_time),
        input.participation_requirements == null ? null : String(input.participation_requirements),
      ],
    );
    void postBroadcast('announcement-update', { action: 'create', id: (row as any)?.id });
    res.status(201).json({ data: row, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.patch('/announcements/:id', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).profileId as string;
    await requireProfileAdmin(actorId);
    const input = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if ('title' in input) { sets.push(`title = $${i++}`); values.push(String(input.title || '').trim()); }
    if ('content' in input) { sets.push(`content = $${i++}`); values.push(String(input.content || '').trim()); }
    if ('is_pinned' in input) { sets.push(`is_pinned = $${i++}`); values.push(!!input.is_pinned); }
    if ('is_active' in input) { sets.push(`is_active = $${i++}`); values.push(!!input.is_active); }
    if ('priority' in input) {
      const priority = String(input.priority);
      sets.push(`priority = $${i++}`);
      values.push(['normal', 'important', 'critical'].includes(priority) ? priority : 'normal');
    }
    if ('type' in input) { sets.push(`type = $${i++}`); values.push(input.type === 'event' ? 'event' : 'announcement'); }
    if ('event_date' in input) {
      sets.push(`event_date = $${i++}`);
      values.push(input.event_date ? new Date(String(input.event_date)).toISOString() : null);
    }
    if ('participation_time' in input) { sets.push(`participation_time = $${i++}`); values.push(input.participation_time == null ? null : String(input.participation_time)); }
    if ('participation_requirements' in input) { sets.push(`participation_requirements = $${i++}`); values.push(input.participation_requirements == null ? null : String(input.participation_requirements)); }
    if (!sets.length) throw new AuthError(400, 'Güncellenecek alan yok');
    sets.push('updated_at = now()');
    values.push(req.params.id);
    const row = await queryOne(
      `UPDATE announcements SET ${sets.join(', ')} WHERE id::text = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new AuthError(404, 'Duyuru bulunamadı');
    void postBroadcast('announcement-update', { action: 'update', id: req.params.id });
    res.json({ data: row, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/announcements/:id', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).profileId as string;
    await requireProfileAdmin(actorId);
    const deleted = await execute('DELETE FROM announcements WHERE id::text = $1', [req.params.id]);
    void postBroadcast('announcement-update', { action: 'delete', id: req.params.id });
    res.json({ data: { ok: deleted > 0 }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/room-messages', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const channelId = String(req.query.channelId || '');
    if (!channelId) throw new AuthError(400, 'channelId gerekli');
    await requireRoomMessageAccess(channelId, (req as any).userId, false);
    const rows = await queryMany(
      `SELECT *
         FROM room_messages
        WHERE channel_id = $1
        ORDER BY created_at ASC
        LIMIT 200`,
      [channelId],
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/room-messages', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const profileId = (req as any).profileId as string;
    const channelId = String(req.body?.channelId || req.body?.channel_id || '');
    const text = String(req.body?.text || '').trim();
    if (!channelId) throw new AuthError(400, 'channelId gerekli');
    if (!text) throw new AuthError(400, 'Mesaj boş olamaz');
    if (text.length > 2000) throw new AuthError(400, 'Mesaj çok uzun');
    await requireRoomMessageAccess(channelId, userId, true);
    const profile = await queryOne<{ display_name: string | null; name: string | null; avatar: string | null }>(
      'SELECT display_name, name, avatar FROM profiles WHERE id = $1',
      [profileId],
    );
    const row = await queryOne(
      `INSERT INTO room_messages (id, channel_id, sender_id, sender_name, sender_avatar, text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [
        crypto.randomUUID(),
        channelId,
        profileId,
        String(req.body?.senderName || req.body?.sender_name || profile?.display_name || profile?.name || 'Kullanıcı'),
        String(req.body?.senderAvatar || req.body?.sender_avatar || profile?.avatar || ''),
        text,
      ],
    );
    res.status(201).json({ data: row, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.patch('/room-messages/:id', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const profileId = (req as any).profileId as string;
    const text = String(req.body?.text || '').trim();
    if (!text) throw new AuthError(400, 'Mesaj boş olamaz');
    if (text.length > 2000) throw new AuthError(400, 'Mesaj çok uzun');
    const msg = await queryOne<{ id: string; channel_id: string; sender_id: string | null; server_id: string }>(
      `SELECT rm.id, rm.channel_id, rm.sender_id, c.server_id
         FROM room_messages rm
         JOIN channels c ON c.id = rm.channel_id
        WHERE rm.id::text = $1`,
      [req.params.id],
    );
    if (!msg) throw new AuthError(404, 'Mesaj bulunamadı');
    if (msg.sender_id !== profileId && !(await canModerateRoomMessages(msg.server_id, userId))) {
      throw new AuthError(403, 'Mesajı düzenleme yetkin yok');
    }
    const row = await queryOne(
      'UPDATE room_messages SET text = $1 WHERE id::text = $2 RETURNING *',
      [text, req.params.id],
    );
    res.json({ data: row, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/room-messages/:id', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const profileId = (req as any).profileId as string;
    const msg = await queryOne<{ id: string; sender_id: string | null; server_id: string }>(
      `SELECT rm.id, rm.sender_id, c.server_id
         FROM room_messages rm
         JOIN channels c ON c.id = rm.channel_id
        WHERE rm.id::text = $1`,
      [req.params.id],
    );
    if (!msg) throw new AuthError(404, 'Mesaj bulunamadı');
    if (msg.sender_id !== profileId && !(await canModerateRoomMessages(msg.server_id, userId))) {
      throw new AuthError(403, 'Mesajı silme yetkin yok');
    }
    const deleted = await execute('DELETE FROM room_messages WHERE id::text = $1', [req.params.id]);
    res.json({ data: { ok: deleted > 0 }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/room-messages/channel/:channelId', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { serverId } = await requireRoomMessageAccess(req.params.channelId as string, userId, false);
    if (!(await canModerateRoomMessages(serverId, userId))) throw new AuthError(403, 'Mesajları temizleme yetkin yok');
    const deleted = await execute('DELETE FROM room_messages WHERE channel_id = $1', [req.params.channelId]);
    res.json({ data: { ok: true, deleted }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/invite/admin/requests', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await requireProfileAdmin((req as any).profileId as string);
    const rows = await queryMany<any>(
      `SELECT ir.*, b.rejection_count, b.blocked_until, b.permanently_blocked
         FROM invite_requests ir
         LEFT JOIN invite_email_bans b ON lower(b.email) = lower(ir.email)
        WHERE ir.status IN ('pending','sending','failed')
        ORDER BY ir.created_at DESC
        LIMIT 200`,
    );
    res.json({ items: rows.map(inviteRequestDto) });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/invite/admin/requests/:id/send-code', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).profileId as string;
    await requireProfileAdmin(adminId);
    const request = await queryOne<any>('SELECT * FROM invite_requests WHERE id::text = $1 LIMIT 1', [req.params.id]);
    if (!request) {
      res.json({ error: 'not_found' });
      return;
    }
    if (!['pending', 'failed', 'sending'].includes(request.status)) {
      res.json({ error: 'invalid_status', current_status: request.status });
      return;
    }
    let code = inviteCode();
    for (let tries = 0; tries < 5; tries++) {
      const exists = await queryOne<{ code: string }>('SELECT code FROM invite_codes WHERE code = $1', [code]);
      if (!exists) break;
      code = inviteCode();
    }
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await queryOne(
      `INSERT INTO invite_codes (code, created_by, email, expires_at, used)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (code) DO NOTHING`,
      [code, adminId, request.email, expiresAt],
    );
    await execute(
      `UPDATE invite_requests
          SET status = 'sending',
              code = $2,
              approved_invite_code = $2,
              expires_at = $3,
              sent_by = $4,
              last_send_error = NULL,
              updated_at = now()
        WHERE id = $1`,
      [request.id, code, expiresAt, adminId],
    );
    const mailResp = await fetch('http://127.0.0.1:10000/api/send-invite-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.authorization || '',
      },
      body: JSON.stringify({ email: request.email, code, expiresAt }),
    });

    if (mailResp.ok === false) {
      const mailError = await mailResp.text().catch(() => '');
      await execute(
        "UPDATE invite_requests SET status = 'failed', last_send_error = $2, updated_at = now() WHERE id = $1",
        [request.id, mailError.slice(0, 500) || 'mail_send_failed'],
      );
      res.status(502).json({ error: 'mail_send_failed', detail: mailError.slice(0, 300) });
      return;
    }

    await execute(
      "UPDATE invite_requests SET status = 'sent', last_send_error = NULL, updated_at = now() WHERE id = $1",
      [request.id],
    );

    res.json({ ok: true, code, expires_at: expiresAt, email: request.email, mailed: true });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/invite/admin/requests/:id/mark-sent', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await requireProfileAdmin((req as any).profileId as string);
    await execute("UPDATE invite_requests SET status = 'sent', updated_at = now() WHERE id::text = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/invite/admin/requests/:id/mark-failed', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await requireProfileAdmin((req as any).profileId as string);
    await execute(
      "UPDATE invite_requests SET status = 'failed', last_send_error = $2, updated_at = now() WHERE id::text = $1",
      [req.params.id, String(req.body?.error || 'E-posta gönderilemedi').slice(0, 500)],
    );
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/invite/admin/requests/:id', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await requireProfileAdmin((req as any).profileId as string);
    const request = await queryOne<any>('SELECT * FROM invite_requests WHERE id::text = $1 LIMIT 1', [req.params.id]);
    if (!request) {
      res.json({ ok: true, deleted: false });
      return;
    }

    await execute(
      `DELETE FROM invite_codes
        WHERE used = false
          AND (
            access_request_id = $1
            OR (email IS NOT NULL AND lower(email) = lower($2) AND code = $3)
          )`,
      [request.id, request.email, request.code || request.approved_invite_code || null],
    );
    await execute('DELETE FROM invite_requests WHERE id = $1', [request.id]);
    res.json({ ok: true, deleted: true });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/invite/admin/requests/:id/reject', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await requireProfileAdmin((req as any).profileId as string);
    const row = await queryOne<any>(
      `UPDATE invite_requests
          SET status = 'rejected',
              reviewed_by = $2,
              reviewed_at = now(),
              updated_at = now()
        WHERE id::text = $1
        RETURNING *`,
      [req.params.id, (req as any).profileId],
    );
    if (row?.email) {
      await execute(
        `INSERT INTO invite_email_bans (email, rejection_count, blocked_until, permanently_blocked)
         VALUES ($1, 1, NULL, false)
         ON CONFLICT (email) DO UPDATE SET rejection_count = invite_email_bans.rejection_count + 1`,
        [row.email],
      );
    }
    res.json({ ok: !!row });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/invite/admin/codes', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await requireProfileAdmin((req as any).profileId as string);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '25'), 10) || 25));
    const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? '0'), 10) || 0);
    const rows = await queryMany<any>(
      `SELECT code, expires_at, used, used_by_email, used_at, created_at, COUNT(*) OVER()::int AS total
         FROM invite_codes
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json({
      items: rows.map(r => ({
        code: r.code,
        expires_at: Number(r.expires_at || 0),
        used: !!r.used,
        used_by_email: r.used_by_email ?? null,
        used_at: r.used_at != null ? new Date(r.used_at).getTime() : null,
        created_at: r.created_at,
      })),
      total: rows[0]?.total ?? 0,
    });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/invite/admin/codes', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).profileId as string;
    await requireProfileAdmin(adminId);
    const code = String(req.body?.code || inviteCode()).trim().toUpperCase();
    const expiresAt = Number(req.body?.expiresAt || req.body?.expires_at || (Date.now() + 24 * 60 * 60 * 1000));
    await execute(
      `INSERT INTO invite_codes (code, created_by, expires_at, used)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (code) DO UPDATE SET expires_at = EXCLUDED.expires_at, used = false`,
      [code, adminId, expiresAt],
    );
    res.json({ data: { code }, error: null });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.delete('/invite/admin/codes/:code', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await requireProfileAdmin((req as any).profileId as string);
    const updated = await execute('UPDATE invite_codes SET used = true, revoked_at = now(), used_at = now() WHERE code = $1', [String(req.params.code).toUpperCase()]);
    res.json({ ok: updated > 0 });
  } catch (err) {
    handleAuthError(res, err);
  }
});

export default router;

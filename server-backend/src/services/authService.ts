import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { pool, queryOne } from '../repositories/db';
import { config } from '../config';

export type AuthRole = 'user' | 'server_admin' | 'system_admin';

export interface JwtUserPayload {
  userId: string;
  appUserId: string;
  profileId: string;
  email: string;
  username: string;
  role: AuthRole;
}

interface AuthUserRow {
  user_id: string;
  profile_id: string;
  email: string | null;
  username: string | null;
  password_hash: string;
  temp_password_hash: string | null;
  temp_password_expires_at: string | null;
  profile_role: string | null;
  name: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  avatar: string | null;
  is_admin: boolean | null;
  is_primary_admin: boolean | null;
  is_moderator: boolean | null;
  is_muted: boolean | null;
  mute_expires: number | null;
  is_voice_banned: boolean | null;
  ban_expires: number | null;
  must_change_password: boolean | null;
  app_version: string | null;
  last_seen_at: string | null;
  total_usage_minutes: number | null;
  show_last_seen: boolean | null;
  server_creation_plan: string | null;
  user_level: string | null;
  avatar_border_color: string | null;
  allow_non_friend_dms: boolean | null;
  dm_privacy_mode: string | null;
  show_dm_read_receipts: boolean | null;
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

const USER_SELECT = `
  SELECT
    au.id AS user_id,
    au.profile_id,
    au.email,
    au.username,
    au.password_hash,
    au.temp_password_hash,
    au.temp_password_expires_at,
    p.role AS profile_role,
    p.name,
    p.display_name,
    p.first_name,
    p.last_name,
    p.age,
    p.avatar,
    p.is_admin,
    p.is_primary_admin,
    p.is_moderator,
    p.is_muted,
    p.mute_expires,
    p.is_voice_banned,
    p.ban_expires,
    p.must_change_password,
    p.app_version,
    p.last_seen_at,
    p.total_usage_minutes,
    p.show_last_seen,
    p.server_creation_plan,
    p.user_level,
    p.avatar_border_color,
    p.allow_non_friend_dms,
    p.dm_privacy_mode,
    p.show_dm_read_receipts
  FROM app_users au
  JOIN profiles p ON p.id = au.profile_id
`;

function normalizeRole(row: Pick<AuthUserRow, 'profile_role' | 'is_admin'> & { user_role?: string | null }): AuthRole {
  const raw = row.user_role || row.profile_role;
  if (raw === 'system_admin' || row.is_admin) return 'system_admin';
  if (raw === 'server_admin') return 'server_admin';
  return 'user';
}

function toPayload(row: AuthUserRow): JwtUserPayload {
  return {
    userId: row.user_id,
    appUserId: row.user_id,
    profileId: row.profile_id,
    email: row.email || '',
    username: row.username || row.name || '',
    role: normalizeRole(row),
  };
}

function toPublicUser(row: AuthUserRow) {
  const payload = toPayload(row);
  const dmPrivacyMode =
    row.dm_privacy_mode === 'everyone' ||
    row.dm_privacy_mode === 'mutual_servers' ||
    row.dm_privacy_mode === 'friends_only' ||
    row.dm_privacy_mode === 'closed'
      ? row.dm_privacy_mode
      : (row.allow_non_friend_dms === false ? 'friends_only' : 'everyone');
  return {
    ...payload,
    profile: {
      id: row.profile_id,
      email: row.email || '',
      name: row.name || row.username || row.email || '',
      username: row.username || row.name || '',
      display_name: row.display_name,
      first_name: row.first_name,
      last_name: row.last_name,
      age: row.age,
      avatar: row.avatar,
      is_admin: !!row.is_admin,
      is_primary_admin: !!row.is_primary_admin,
      is_moderator: !!row.is_moderator,
      is_muted: !!row.is_muted,
      mute_expires: row.mute_expires,
      is_voice_banned: !!row.is_voice_banned,
      ban_expires: row.ban_expires,
      must_change_password: !!row.must_change_password,
      app_version: row.app_version,
      last_seen_at: row.last_seen_at,
      total_usage_minutes: row.total_usage_minutes || 0,
      show_last_seen: row.show_last_seen !== false,
      server_creation_plan: row.server_creation_plan,
      user_level: row.user_level,
      avatar_border_color: row.avatar_border_color || '',
      dm_privacy_mode: dmPrivacyMode,
      allow_non_friend_dms: dmPrivacyMode === 'everyone' || dmPrivacyMode === 'mutual_servers',
      show_dm_read_receipts: row.show_dm_read_receipts !== false,
    },
  };
}

function signToken(row: AuthUserRow): string {
  const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(toPayload(row), config.jwtSecret, options);
}

export function verifyAuthToken(token: string): JwtUserPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (!decoded || typeof decoded !== 'object') {
    throw new AuthError(401, 'Geçersiz token');
  }
  const raw = decoded as Partial<JwtUserPayload>;
  if (!raw.appUserId && raw.userId) raw.appUserId = raw.userId;
  if (!raw.userId || !raw.appUserId || !raw.profileId) {
    throw new AuthError(401, 'Geçersiz token');
  }
  return {
    userId: String(raw.userId),
    appUserId: String(raw.appUserId),
    profileId: String(raw.profileId),
    email: String(raw.email || ''),
    username: String(raw.username || ''),
    role: normalizeRole({ user_role: raw.role || null, profile_role: null, is_admin: raw.role === 'system_admin' }),
  };
}

export async function login(identifierRaw: string, password: string) {
  const identifier = String(identifierRaw || '').trim().toLowerCase();
  if (!identifier || !password) throw new AuthError(400, 'identifier ve password gerekli');

  const row = await queryOne<AuthUserRow>(
    `${USER_SELECT}
      WHERE lower(au.email) = $1 OR lower(au.username) = $1
      LIMIT 1`,
    [identifier],
  );
  if (!row) throw new AuthError(401, 'Kullanıcı adı/e-posta veya parola hatalı');

  const ok = await bcrypt.compare(password, row.password_hash);
  const tempPasswordActive = !!row.temp_password_hash && (
    !row.temp_password_expires_at || new Date(row.temp_password_expires_at).getTime() > Date.now()
  );
  const tempOk = !ok && tempPasswordActive
    ? await bcrypt.compare(password, row.temp_password_hash as string)
    : false;
  if (!ok && !tempOk) throw new AuthError(401, 'Kullanıcı adı/e-posta veya parola hatalı');

  const token = signToken(row);
  return {
    token,
    user: toPublicUser({
      ...row,
      must_change_password: tempOk,
    }),
  };
}

export async function me(payload: JwtUserPayload) {
  const row = await queryOne<AuthUserRow>(
    `${USER_SELECT} WHERE au.id = $1 AND au.profile_id = $2 LIMIT 1`,
    [payload.appUserId, payload.profileId],
  );
  if (!row) throw new AuthError(404, 'Kullanıcı bulunamadı');
  return { user: toPublicUser(row) };
}

export async function changePassword(payload: JwtUserPayload, password: string): Promise<void> {
  if (!password || password.length < 6) throw new AuthError(400, 'Parola en az 6 karakter olmalı');
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'UPDATE app_users SET password_hash = $1 WHERE id = $2 AND profile_id = $3',
    [passwordHash, payload.appUserId, payload.profileId],
  );
  if (!result.rowCount) throw new AuthError(404, 'Kullanıcı bulunamadı');
  await pool.query(
    'UPDATE app_users SET temp_password_hash = NULL, temp_password_expires_at = NULL WHERE id = $1 AND profile_id = $2',
    [payload.appUserId, payload.profileId],
  );
  await pool.query(
    'UPDATE profiles SET must_change_password = false, updated_at = now() WHERE id = $1',
    [payload.profileId],
  );
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendTemporaryPasswordEmail(to: string, displayName: string, temporaryPassword: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY || '';
  if (!apiKey) throw new AuthError(500, 'E-posta servisi yapılandırılmamış');

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'MAYVOX <noreply@mayvox.com>',
      reply_to: process.env.RESEND_REPLY_TO || 'support@mayvox.com',
      to: [to],
      subject: 'MayVox - Geçici Parolanız',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1a1a2e;color:#e2e8f0;border-radius:12px;">
        <h2 style="color:#7c3aed;margin-bottom:4px;">MayVox</h2>
        <p style="color:#94a3b8;font-size:13px;margin-top:0;">mayvox.com</p>
        <p>Merhaba <strong>${htmlEscape(displayName)}</strong>,</p>
        <p>Parolanız bir yönetici tarafından sıfırlandı.</p>
        <div style="background:#2d2d44;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
          <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Geçici Parola</p>
          <span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#a78bfa;">${htmlEscape(temporaryPassword)}</span>
        </div>
        <p style="color:#94a3b8;font-size:13px;">Bu parola ile giriş yaptıktan sonra yeni bir parola belirlemeniz istenecektir.</p>
        <hr style="border:none;border-top:1px solid #2d2d44;margin:24px 0;"/>
        <p style="color:#64748b;font-size:11px;margin:0;">Bu e-postayı siz talep etmediyseniz lütfen yöneticinizle iletişime geçin.</p>
      </div>`,
      headers: {
        'List-Unsubscribe': `<mailto:${process.env.RESEND_REPLY_TO || 'support@mayvox.com'}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('[admin-reset-password] email failed', { status: resp.status, detail: detail.slice(0, 240) });
    throw new AuthError(502, 'E-posta gönderilemedi, şifre değiştirilmedi');
  }
}

export async function adminResetUserPassword(targetProfileIdRaw: string): Promise<{ email: string }> {
  const targetProfileId = String(targetProfileIdRaw || '').trim();
  if (!targetProfileId) throw new AuthError(400, 'Kullanıcı gerekli');

  const temporaryPassword = `MVX-${crypto.randomBytes(6).toString('base64url')}`;
  const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query<{
      id: string;
      email: string | null;
      name: string | null;
      display_name: string | null;
      is_primary_admin: boolean | null;
      role: string | null;
      app_user_id: string | null;
    }>(
      `SELECT p.id, p.email, p.name, p.display_name, p.is_primary_admin, p.role, au.id AS app_user_id
         FROM profiles p
         LEFT JOIN app_users au ON au.profile_id = p.id
        WHERE p.id = $1
        FOR UPDATE OF p`,
      [targetProfileId],
    );
    const row = target.rows[0];
    if (!row) throw new AuthError(404, 'Kullanıcı bulunamadı');
    if (!row.email) throw new AuthError(404, 'Kullanıcının e-posta adresi yok');
    if (!row.app_user_id) throw new AuthError(404, 'Kullanıcı giriş kaydı bulunamadı');
    if (row.is_primary_admin || row.role === 'system_admin') {
      throw new AuthError(403, 'Primary admin parolası buradan sıfırlanamaz');
    }

    await sendTemporaryPasswordEmail(row.email, row.display_name || row.name || row.email, temporaryPassword);
    await client.query(
      `UPDATE app_users
          SET temp_password_hash = $1,
              temp_password_expires_at = now() + interval '24 hours'
        WHERE id = $2`,
      [temporaryPasswordHash, row.app_user_id],
    );
    await client.query(
      `UPDATE profiles
          SET must_change_password = false,
              password_reset_requested = false,
              updated_at = now()
        WHERE id = $1`,
      [targetProfileId],
    );
    await client.query('COMMIT');
    return { email: row.email };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* no-op */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyCurrentPassword(payload: JwtUserPayload, password: string): Promise<void> {
  if (!password) throw new AuthError(400, 'Parola gerekli');
  const row = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM app_users WHERE id = $1 AND profile_id = $2 LIMIT 1',
    [payload.appUserId, payload.profileId],
  );
  if (!row) throw new AuthError(404, 'Kullanıcı bulunamadı');
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) throw new AuthError(401, 'Parola hatalı');
}

export async function changeEmail(payload: JwtUserPayload, emailRaw: string): Promise<void> {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(400, 'Geçersiz e-posta');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id FROM app_users WHERE lower(email) = $1 AND id <> $2 LIMIT 1',
      [email, payload.appUserId],
    );
    if (existing.rows[0]) throw new AuthError(409, 'Bu e-posta zaten kullanılıyor');
    await client.query('UPDATE app_users SET email = $1 WHERE id = $2 AND profile_id = $3', [email, payload.appUserId, payload.profileId]);
    await client.query('UPDATE profiles SET email = $1 WHERE id = $2', [email, payload.profileId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface ProfileUpdateInput {
  id?: string;
  name?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  avatar?: string;
  avatar_border_color?: string;
  app_version?: string;
  total_usage_minutes?: number;
  show_last_seen?: boolean;
  allow_non_friend_dms?: boolean;
  dm_privacy_mode?: string;
  show_dm_read_receipts?: boolean;
}

export async function updateProfile(payload: JwtUserPayload, input: ProfileUpdateInput) {
  if (input.id && input.id !== payload.profileId) throw new AuthError(403, 'Profil yetkisi geçersiz');

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.name !== undefined) {
    const name = String(input.name || '').trim();
    if (!name) throw new AuthError(400, 'Kullanıcı adı boş olamaz');
    sets.push(`name = $${i++}`);
    values.push(name);
  }
  if (input.display_name !== undefined) {
    const displayName = String(input.display_name || '').trim();
    if (displayName.length < 2 || displayName.length > 24) throw new AuthError(400, 'Takma ad 2-24 karakter olmalı');
    sets.push(`display_name = $${i++}`);
    values.push(displayName);
  }
  if (input.first_name !== undefined) {
    sets.push(`first_name = $${i++}`);
    values.push(String(input.first_name || '').trim());
  }
  if (input.last_name !== undefined) {
    sets.push(`last_name = $${i++}`);
    values.push(String(input.last_name || '').trim());
  }
  if (input.age !== undefined) {
    const age = Number(input.age);
    if (!Number.isFinite(age) || age < 1 || age > 120) throw new AuthError(400, 'Yaş geçersiz');
    sets.push(`age = $${i++}`);
    values.push(Math.trunc(age));
  }
  if (input.avatar !== undefined) {
    sets.push(`avatar = $${i++}`);
    values.push(String(input.avatar || ''));
  }
  if (input.avatar_border_color !== undefined) {
    sets.push(`avatar_border_color = $${i++}`);
    values.push(String(input.avatar_border_color || '').trim());
  }
  if (input.app_version !== undefined) {
    sets.push(`app_version = $${i++}`);
    values.push(String(input.app_version || '').trim());
  }
  if (input.total_usage_minutes !== undefined) {
    const total = Number(input.total_usage_minutes);
    if (!Number.isFinite(total) || total < 0) throw new AuthError(400, 'Kullanım süresi geçersiz');
    sets.push(`total_usage_minutes = $${i++}::integer`);
    values.push(Math.trunc(total));
  }
  if (input.show_last_seen !== undefined) {
    sets.push(`show_last_seen = $${i++}::boolean`);
    values.push(!!input.show_last_seen);
  }
  if (input.allow_non_friend_dms !== undefined) {
    sets.push(`allow_non_friend_dms = $${i++}::boolean`);
    values.push(!!input.allow_non_friend_dms);
  }
  if (input.dm_privacy_mode !== undefined) {
    const mode = String(input.dm_privacy_mode || '').trim();
    if (mode !== 'everyone' && mode !== 'mutual_servers' && mode !== 'friends_only' && mode !== 'closed') {
      throw new AuthError(400, 'DM gizlilik modu geçersiz');
    }
    sets.push(`dm_privacy_mode = $${i++}::text`);
    values.push(mode);
    if (input.allow_non_friend_dms === undefined) {
      sets.push(`allow_non_friend_dms = $${i++}::boolean`);
      values.push(mode === 'everyone' || mode === 'mutual_servers');
    }
  }
  if (input.show_dm_read_receipts !== undefined) {
    sets.push(`show_dm_read_receipts = $${i++}::boolean`);
    values.push(!!input.show_dm_read_receipts);
  }

  if (sets.length) {
    sets.push('updated_at = now()');
    values.push(payload.profileId);
    const result = await pool.query(`UPDATE profiles SET ${sets.join(', ')} WHERE id = $${i}::uuid`, values);
    if (!result.rowCount) throw new AuthError(404, 'Profil bulunamadı');
  }

  return me(payload);
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  avatar?: string;
}

export async function register(input: RegisterInput) {
  const email = String(input.email || '').trim().toLowerCase();
  const username = String(input.username || '').trim().toLowerCase();
  if (!email || !username || !input.password) throw new AuthError(400, 'email, username ve password gerekli');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(400, 'Geçersiz e-posta');
  if (!/^[a-z0-9_]{1,32}$/.test(username)) throw new AuthError(400, 'Geçersiz kullanıcı adı');
  if (input.password.length < 6) throw new AuthError(400, 'Parola en az 6 karakter olmalı');

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM app_users WHERE lower(email) = $1 OR lower(username) = $2 LIMIT 1',
    [email, username],
  );
  if (existing) throw new AuthError(409, 'E-posta veya kullanıcı adı zaten kayıtlı');

  const passwordHash = await bcrypt.hash(input.password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profileRes = await client.query<AuthUserRow>(
      `INSERT INTO profiles
        (name, email, display_name, first_name, last_name, age, avatar, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'user')
       RETURNING id AS profile_id, email, name, display_name, first_name, last_name, age, avatar,
         is_admin, is_primary_admin, is_moderator, is_muted, mute_expires, is_voice_banned,
         ban_expires, must_change_password, app_version, last_seen_at, total_usage_minutes,
         show_last_seen, server_creation_plan, role AS profile_role, user_level, avatar_border_color,
         allow_non_friend_dms, dm_privacy_mode, show_dm_read_receipts`,
      [
        username,
        email,
        input.displayName || `${input.firstName || ''} ${input.lastName || ''}`.trim() || username,
        input.firstName || '',
        input.lastName || '',
        input.age || 18,
        input.avatar || '',
      ],
    );
    const profile = profileRes.rows[0];
    const userRes = await client.query<{ user_id: string }>(
      `INSERT INTO app_users (profile_id, email, username, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id AS user_id`,
      [profile.profile_id, email, username, passwordHash],
    );
    await client.query('COMMIT');
    const row: AuthUserRow = {
      ...profile,
      user_id: userRes.rows[0].user_id,
      username,
      password_hash: passwordHash,
    };
    return { token: signToken(row), user: toPublicUser(row) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

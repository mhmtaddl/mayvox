import bcrypt from 'bcrypt';
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
    p.avatar_border_color
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
  if (!ok) throw new AuthError(401, 'Kullanıcı adı/e-posta veya parola hatalı');

  const token = signToken(row);
  return { token, user: toPublicUser(row) };
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
    sets.push(`total_usage_minutes = $${i++}`);
    values.push(Math.trunc(total));
  }
  if (input.show_last_seen !== undefined) {
    sets.push(`show_last_seen = $${i++}`);
    values.push(!!input.show_last_seen);
  }

  if (sets.length) {
    sets.push('updated_at = now()');
    values.push(payload.profileId);
    const result = await pool.query(`UPDATE profiles SET ${sets.join(', ')} WHERE id = $${i}`, values);
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
         show_last_seen, server_creation_plan, role AS profile_role, user_level, avatar_border_color`,
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

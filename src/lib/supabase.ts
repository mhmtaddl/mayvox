import { createClient } from '@supabase/supabase-js';
import {
  authHeader,
  changeEmail,
  changePassword,
  clearAuthToken,
  getAuthPayload,
  getAuthToken,
  login,
  register,
} from './authClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// REGISTER
export const signUp = async (email: string, password: string) => {
  return await register({ email, username: email.split('@')[0] || email, password });
};

// LOGIN
export const signIn = async (email: string, password: string) => {
  return await login(email, password);
};

// LOGOUT
export const signOut = async () => {
  clearAuthToken();
  return { error: null };
};

// GET CURRENT USER
export const getUser = async () => {
  return { data: { user: getAuthPayload() }, error: null };
};

// GET CURRENT SESSION
export const getSession = async () => {
  const token = getAuthToken();
  const payload = getAuthPayload();
  return { data: { session: token ? { access_token: token, user: { id: payload?.profileId, email: payload?.email } } : null }, error: null };
};

// AUTH STATE LISTENER
export const onAuthStateChange = () => {
  return { data: { subscription: { unsubscribe: () => {} } } };
};

// SAVE PROFILE
export const saveProfile = async (profile: {
  id: string;
  name: string;
  display_name?: string;
  email?: string;
  first_name: string;
  last_name: string;
  age: number;
  avatar: string;
}) => {
  return await supabase.from('profiles').upsert(profile);
};

// GET PROFILE
export const getProfile = async (id: string) => {
  return await supabase.from('profiles').select('*').eq('id', id).single();
};

// GET PROFILE BY USERNAME
export const getProfileByUsername = async (username: string) => {
  return await supabase.from('profiles').select('*').eq('name', username).single();
};

// GET ALL PROFILES
export const getAllProfiles = async () => {
  return await supabase.from('profiles').select('*').order('name');
};

// UPDATE OWN APP VERSION (kalıcılık: kullanıcı offline olsa bile son versiyon görünsün)
export const updateUserAppVersion = async (id: string, version: string) => {
  return await supabase
    .from('profiles')
    .update({ app_version: version })
    .eq('id', id);
};

// Logout / window close sırasında birikimli kullanım dakikasını yazar.
// NOT: last_seen_at artık backend (chat-server) tarafından yönetiliyor —
// son WS session kapanınca server NOW() ile yazılır. Burada dokunmuyoruz.
export const updateActivityOnLogout = async (id: string, totalUsageMinutes: number) => {
  return await supabase
    .from('profiles')
    .update({ total_usage_minutes: totalUsageMinutes })
    .eq('id', id);
};

// Son görülme gizlilik ayarını güncelle
export const updateShowLastSeen = async (id: string, show: boolean) => {
  return await supabase
    .from('profiles')
    .update({ show_last_seen: show })
    .eq('id', id);
};

// GET USER SETTINGS
export const getUserSettings = async (userId: string) => {
  return await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
};

// UPDATE USER SETTINGS
export const updateUserSettings = async (userId: string, settings: Record<string, unknown>) => {
  return await supabase.from('user_settings').upsert({ user_id: userId, ...settings });
};

// UPDATE USER MODERATION (admin/mute/ban) — server-side admin kontrolü ile
export const updateUserModeration = async (id: string, updates: {
  is_admin?: boolean;
  is_primary_admin?: boolean;
  is_muted?: boolean;
  mute_expires?: number | null;
  is_voice_banned?: boolean;
  ban_expires?: number | null;
}) => {
  return await supabase.rpc('moderate_user', {
    target_user_id: id,
    updates: updates,
  });
};

// Admin → diğer kullanıcının server_creation_plan değerini değiştirir (RPC).
export const setServerCreationPlan = async (targetUserId: string, newPlan: 'none' | 'free' | 'pro' | 'ultra') => {
  return await supabase.rpc('set_server_creation_plan', {
    target_user_id: targetUserId,
    new_plan: newPlan,
  });
};

// UPDATE AUTH EMAIL
export const updateUserEmail = async (email: string) => {
  try {
    await changeEmail(email);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('E-posta güncellenemedi') };
  }
};

// UPDATE AUTH PASSWORD
export const updateUserPassword = async (password: string) => {
  try {
    await changePassword(password);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Parola güncellenemedi') };
  }
};

// GET CHANNELS (user-created only)
export const getChannels = async () => {
  return await supabase.from('channels').select('*').order('created_at');
};

// CREATE CHANNEL
export const createChannel = async (channel: {
  id: string;
  name: string;
  owner_id: string;
  max_users: number;
  is_invite_only: boolean;
  is_hidden: boolean;
  password?: string;
  mode?: string;
  speaker_ids?: string[];
}) => {
  return await supabase.from('channels').insert(channel);
};

// UPDATE CHANNEL
export const updateChannel = async (id: string, updates: {
  name?: string;
  max_users?: number;
  is_invite_only?: boolean;
  is_hidden?: boolean;
  mode?: string;
  speaker_ids?: string[];
}) => {
  return await supabase.from('channels').update(updates).eq('id', id);
};

// DELETE USER (server-side admin kontrolü + auth.users silme)
export const deleteUser = async (userId: string) => {
  return await supabase.rpc('delete_user', { p_target_user_id: userId });
};

// VERIFY CHANNEL PASSWORD (server-side bcrypt karşılaştırma)
export const verifyChannelPassword = async (channelId: string, password: string) => {
  return await supabase.rpc('verify_channel_password', {
    p_channel_id: channelId,
    p_plain_password: password,
  });
};

// SET CHANNEL PASSWORD (server-side bcrypt hashleme)
export const setChannelPassword = async (channelId: string, password: string | null) => {
  return await supabase.rpc('set_channel_password', {
    p_channel_id: channelId,
    p_plain_password: password ?? '',
  });
};

// GET PROFILES WITH PENDING PASSWORD RESET REQUEST
export const getPendingPasswordResets = async () => {
  return await supabase
    .from('profiles')
    .select('id, name, display_name, first_name, last_name, email')
    .eq('password_reset_requested', true);
};

// CLEAR MUST CHANGE PASSWORD FLAG (current user clears their own)
export const clearMustChangePassword = async (userId: string) => {
  return await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', userId);
};

// DELETE CHANNEL
export const deleteChannel = async (id: string) => {
  return await supabase.from('channels').delete().eq('id', id);
};

// SAVE INVITE CODE (önceki kodları silmez — liste birikir; kullanılınca/süresi
// dolunca tarihsel kayıt olarak kalır, "kim kullandı" gösterimi için gerekli)
export const saveInviteCode = async (code: string, expiresAt: number) => {
  const payload = getAuthPayload();
  return await supabase.from('invite_codes').insert({
    code: code.toUpperCase(),
    created_by: payload?.profileId,
    expires_at: expiresAt,
    used: false,
  });
};

// ADMIN: kendi ürettiği global davet kodlarını listele (sayfalı)
export interface AdminInviteCodeRow {
  code: string;
  expires_at: number;
  used: boolean;
  used_by_email: string | null;
  used_at: number | null;
  created_at: string;
}
// Admin: kendi ürettiği bir davet kodunu geçersiz kıl
export const invalidateInviteCode = async (code: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('invalidate_invite_code', { p_code: code });
  if (error) throw error;
  return !!data;
};

export const listAdminInviteCodes = async (
  limit: number,
  offset: number,
): Promise<{ items: AdminInviteCodeRow[]; total: number }> => {
  const { data, error } = await supabase.rpc('list_admin_invite_codes', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  type RawRow = {
    out_code: string;
    out_expires_at: number | string;
    out_used: boolean;
    out_used_by_email: string | null;
    out_used_at: number | string | null;
    out_created_at: string;
    out_total_count: number | string;
  };
  const rows = (data || []) as RawRow[];
  const total = rows.length > 0 ? Number(rows[0].out_total_count) : 0;
  return {
    items: rows.map(r => ({
      code: r.out_code,
      expires_at: Number(r.out_expires_at),
      used: !!r.out_used,
      used_by_email: r.out_used_by_email,
      used_at: r.out_used_at != null ? Number(r.out_used_at) : null,
      created_at: r.out_created_at,
    })),
    total,
  };
};

// ─── Davet Talebi Sistemi ────────────────────────────────────────────────────

// DAVET KODU İSTE (anon)
export const requestInvite = async (email: string): Promise<{
  ok?: boolean;
  request_id?: string;
  expires_at?: number;
  error?: string;
  message?: string;
  blocked_until?: number;
  rejection_count?: number;
  status?: string;
}> => {
  const { data, error } = await supabase.rpc('request_invite', { p_email: email });
  if (error) throw error;
  return data;
};

// DAVET TALEBİ DURUMU (anon — UUID capability token)
export const getInviteRequestStatus = async (requestId: string): Promise<{
  status?: string;
  email?: string;
  expires_at?: number;
  rejection_count?: number;
  blocked_until?: number | null;
  permanently_blocked?: boolean;
  error?: string;
} | null> => {
  const { data, error } = await supabase.rpc('get_invite_request_status', { p_request_id: requestId });
  if (error) return null;
  return data;
};

// ADMIN: KOD GÖNDER
export const adminSendInviteCode = async (requestId: string): Promise<{
  ok?: boolean;
  code?: string;
  expires_at?: number;
  email?: string;
  error?: string;
  current_status?: string;
}> => {
  const { data, error } = await supabase.rpc('admin_send_invite_code', { p_request_id: requestId });
  if (error) throw error;
  return data;
};

// ADMIN: DAVETI REDDET
export const adminRejectInvite = async (requestId: string): Promise<{
  ok?: boolean;
  rejection_count?: number;
  blocked_until?: number | null;
  permanently_blocked?: boolean;
  error?: string;
}> => {
  const { data, error } = await supabase.rpc('admin_reject_invite', { p_request_id: requestId });
  if (error) throw error;
  return data;
};

// ADMIN: BEKLEYENLERİ LİSTELE
export const getPendingInviteRequests = async (): Promise<Array<{
  id: string;
  email: string;
  status: string;
  expires_at: number;
  created_at: string;
  rejection_count: number;
  blocked_until?: number | null;
  permanently_blocked: boolean;
}>> => {
  const { data, error } = await supabase.rpc('get_pending_invite_requests');
  if (error) return [];
  return Array.isArray(data) ? data : [];
};

// VERIFY INVITE CODE FOR EMAIL (email bağlamalı, anon)
export const verifyInviteCodeForEmail = async (code: string, email: string): Promise<boolean> => {
  const { data } = await supabase.rpc('verify_invite_code_for_email', {
    p_code: code.toUpperCase(),
    p_email: email,
  });
  return !!data;
};

// USE INVITE CODE FOR EMAIL (email bağlamalı, anon)
export const useInviteCodeForEmail = async (code: string, email: string): Promise<boolean> => {
  const { data } = await supabase.rpc('use_invite_code_for_email', {
    p_code: code.toUpperCase(),
    p_email: email,
  });
  return !!data;
};

// SEND INVITE EMAIL via token server
export const sendInviteEmail = async (
  email: string,
  code: string,
  expiresAt: number,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const token = getAuthToken();
    if (!token) return { success: false, error: 'Oturum bulunamadı' };
    const tokenServerUrl = import.meta.env.VITE_TOKEN_SERVER_URL as string;
    const res = await fetch(`${tokenServerUrl}/api/send-invite-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: JSON.stringify({ email, code, expiresAt }),
    });
    if (res.ok) return { success: true };
    const body = await res.json().catch(() => ({}));
    return { success: false, error: body?.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Ağ hatası' };
  }
};

// SEND REJECTION EMAIL via token server
export const sendRejectionEmail = async (
  email: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const token = getAuthToken();
    if (!token) return { success: false, error: 'Oturum bulunamadı' };
    const tokenServerUrl = import.meta.env.VITE_TOKEN_SERVER_URL as string;
    const res = await fetch(`${tokenServerUrl}/api/send-rejection-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: JSON.stringify({ email, reason }),
    });
    if (res.ok) return { success: true };
    const body = await res.json().catch(() => ({}));
    return { success: false, error: body?.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Ağ hatası' };
  }
};

// ADMIN: KODU GÖNDERILDI OLARAK İŞARETLE
export const adminMarkInviteSent = async (requestId: string): Promise<{ ok?: boolean; error?: string }> => {
  const { data, error } = await supabase.rpc('admin_mark_invite_sent', { p_request_id: requestId });
  if (error) throw error;
  return data;
};

// ADMIN: GÖNDERIM BAŞARISIZ OLARAK İŞARETLE
export const adminMarkInviteFailed = async (requestId: string, sendError: string): Promise<{ ok?: boolean; error?: string }> => {
  const { data, error } = await supabase.rpc('admin_mark_invite_failed', {
    p_request_id: requestId,
    p_error: sendError,
  });
  if (error) throw error;
  return data;
};

// ADMIN: TÜM AKSİYON BEKLEYENLERİ LİSTELE (pending + failed + sending)
export const getAdminInviteRequests = async (): Promise<Array<{
  id: string;
  email: string;
  status: string;
  code?: string | null;
  expires_at: number;
  created_at: string;
  rejection_count: number;
  blocked_until?: number | null;
  permanently_blocked: boolean;
  last_send_error?: string | null;
}>> => {
  const { data, error } = await supabase.rpc('get_admin_invite_requests');
  if (error) return [];
  return Array.isArray(data) ? data : [];
};

// ─── Moderatör Yönetimi ─────────────────────────────────────────────────────
export const toggleUserModerator = async (targetUserId: string, newValue: boolean) => {
  return await supabase.rpc('toggle_moderator', {
    target_user_id: targetUserId,
    new_value: newValue,
  });
};

// ─── Duyurular (Announcements) ──────────────────────────────────────────────
export const getAnnouncements = async () => {
  return await supabase
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
};

export const createAnnouncement = async (announcement: {
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  is_pinned?: boolean;
  priority?: string;
  type?: string;
  event_date?: string | null;
  participation_time?: string | null;
  participation_requirements?: string | null;
}) => {
  return await supabase.from('announcements').insert(announcement).select().single();
};

export const updateAnnouncement = async (id: string, updates: {
  title?: string;
  content?: string;
  is_pinned?: boolean;
  priority?: string;
  is_active?: boolean;
  type?: string;
  event_date?: string | null;
  participation_time?: string | null;
  participation_requirements?: string | null;
}) => {
  return await supabase.from('announcements').update(updates).eq('id', id).select().single();
};

export const deleteAnnouncement = async (id: string) => {
  return await supabase.from('announcements').delete().eq('id', id);
};

// UPLOAD AVATAR — Supabase Storage "avatars" bucket'ına yükler, public URL döner
export const uploadAvatar = async (userId: string, file: File): Promise<string> => {
  const path = `${userId}/avatar`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// UPLOAD SERVER LOGO — Supabase Storage "avatars" bucket'ına sunucu logosu yükler
export const uploadServerLogo = async (serverId: string, file: File): Promise<string> => {
  const path = `server-logos/${serverId}/logo`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// ── Room Chat Messages ──────────────────────────────────────────────────────

/** Odanın mesajlarını getir (son 200) */
export async function fetchRoomMessages(channelId: string) {
  const { data, error } = await supabase
    .from('room_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

/** Mesaj gönder */
export async function sendRoomMessage(channelId: string, senderId: string, senderName: string, senderAvatar: string, text: string) {
  const { error } = await supabase.from('room_messages').insert({
    channel_id: channelId,
    sender_id: senderId,
    sender_name: senderName,
    sender_avatar: senderAvatar,
    text,
  });
  if (error) throw error;
}

/** Tek mesaj sil */
export async function deleteRoomMessage(messageId: string) {
  const { error } = await supabase.from('room_messages').delete().eq('id', messageId);
  if (error) throw error;
}

/** Tek mesaj düzenle */
export async function updateRoomMessage(messageId: string, newText: string) {
  const { error } = await supabase.from('room_messages').update({ text: newText }).eq('id', messageId);
  if (error) throw error;
}

/** Odanın tüm mesajlarını sil (admin/mod) */
export async function clearRoomMessages(channelId: string) {
  const { error } = await supabase.from('room_messages').delete().eq('channel_id', channelId);
  if (error) throw error;
}

/** Boş odanın mesajlarını sil (5 dk sonra çağrılır) */
export async function cleanupEmptyRoomMessages(channelId: string) {
  // Odada kimse yoksa sil
  const { error } = await supabase.from('room_messages').delete().eq('channel_id', channelId);
  if (error) console.warn('Cleanup failed:', error);
};

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

const SERVER_API_URL = String(import.meta.env.VITE_SERVER_API_URL || '').replace(/\/$/, '');

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

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
  if (!SERVER_API_URL) throw new Error('VITE_SERVER_API_URL tanımlı değil');
  const token = getAuthToken();
  if (!token) throw new Error('Oturum bulunamadı');

  const res = await fetch(`${SERVER_API_URL}/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profile),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Profil güncellenemedi');
  return { data: body?.user?.profile ?? body?.user ?? null, error: null };
};

export const updateProfileFields = async (updates: Record<string, unknown>) => {
  if (!SERVER_API_URL) throw new Error('VITE_SERVER_API_URL tanımlı değil');
  const token = getAuthToken();
  if (!token) throw new Error('Oturum bulunamadı');

  const res = await fetch(`${SERVER_API_URL}/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Profil güncellenemedi');
  return { data: body?.user?.profile ?? body?.user ?? null, error: null };
};

// GET PROFILE
export const getProfile = async (id: string) => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/profiles?ids=${encodeURIComponent(id)}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: new Error(body?.error || 'Profil bulunamadı') };
  return { data: Array.isArray(body?.data) ? body.data[0] ?? null : null, error: null };
};

// GET PROFILE BY USERNAME
export const getProfileByUsername = async (username: string) => {
  if (!SERVER_API_URL) return { data: null, error: new Error('VITE_SERVER_API_URL tanımlı değil') };
  const res = await fetch(`${SERVER_API_URL}/auth/profiles/by-username/${encodeURIComponent(username)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: new Error(body?.error || 'Profil bulunamadı') };
  return { data: body?.data ?? null, error: null };
};

// GET ALL PROFILES
export const getAllProfiles = async () => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: [], error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/profiles`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { data: [], error: new Error(body?.error || 'Profiller alınamadı') };
  return { data: Array.isArray(body?.data) ? body.data : [], error: null };
};

// UPDATE OWN APP VERSION (kalıcılık: kullanıcı offline olsa bile son versiyon görünsün)
export const updateUserAppVersion = async (id: string, version: string) => {
  void id;
  return updateProfileFields({ app_version: version });
};

// Logout / window close sırasında birikimli kullanım dakikasını yazar.
// NOT: last_seen_at artık backend (chat-server) tarafından yönetiliyor —
// son WS session kapanınca server NOW() ile yazılır. Burada dokunmuyoruz.
export const updateActivityOnLogout = async (id: string, totalUsageMinutes: number) => {
  void id;
  return updateProfileFields({ total_usage_minutes: totalUsageMinutes });
};

// Son görülme gizlilik ayarını güncelle
export const updateShowLastSeen = async (id: string, show: boolean) => {
  void id;
  return updateProfileFields({ show_last_seen: show });
};

// GET USER SETTINGS
export const getUserSettings = async (userId: string) => {
  void userId;
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/settings`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: new Error(body?.error || 'Ayarlar alınamadı') };
  return { data: body?.data ?? null, error: null };
};

// UPDATE USER SETTINGS
export const updateUserSettings = async (userId: string, settings: Record<string, unknown>) => {
  void userId;
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/settings`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: new Error(body?.error || 'Ayarlar güncellenemedi') };
  return { data: body?.data ?? null, error: null };
};

// UPDATE USER MODERATION (admin/mute/ban) — server-side admin kontrolü ile
export const updateUserModeration = async (id: string, updates: {
  is_admin?: boolean;
  is_primary_admin?: boolean;
  is_moderator?: boolean;
  is_muted?: boolean;
  mute_expires?: number | null;
  is_voice_banned?: boolean;
  ban_expires?: number | null;
}) => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/users/${encodeURIComponent(id)}/moderation`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? { data: body?.data ?? null, error: null }
    : { data: null, error: new Error(body?.error || 'Moderasyon güncellenemedi') };
};

// Admin → diğer kullanıcının server_creation_plan değerini değiştirir (RPC).
export const setServerCreationPlan = async (targetUserId: string, newPlan: 'none' | 'free' | 'pro' | 'ultra') => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/users/${encodeURIComponent(targetUserId)}/server-creation-plan`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plan: newPlan }),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? { data: body?.data ?? null, error: null }
    : { data: null, error: new Error(body?.error || 'Plan güncellenemedi') };
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
  return { data: [], error: null };
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
  void channel;
  return { data: null, error: new Error('createChannel legacy helper kullanılmıyor; serverService.createServerChannel kullan') };
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
  void id;
  void updates;
  return { data: null, error: new Error('updateChannel legacy helper kullanılmıyor; serverService.updateServerChannel kullan') };
};

// DELETE USER (server-side admin kontrolü + auth.users silme)
export const deleteUser = async (userId: string) => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? { data: body.data ?? null, error: null }
    : { data: null, error: new Error(body.error || 'Kullanıcı silinemedi') };
};

// VERIFY CHANNEL PASSWORD (server-side bcrypt karşılaştırma)
export const verifyChannelPassword = async (channelId: string, password: string) => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: false, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/channels/${channelId}/verify-password`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { data: false, error: new Error(body.error || 'Kanal şifresi doğrulanamadı') };
  return { data: !!body.data, error: null };
};

// SET CHANNEL PASSWORD (server-side bcrypt hashleme)
export const setChannelPassword = async (channelId: string, password: string | null) => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/channels/${channelId}/password`, {
    method: 'PATCH',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: new Error(body.error || 'Kanal şifresi kaydedilemedi') };
  return { data: body.data ?? null, error: null };
};

// GET PROFILES WITH PENDING PASSWORD RESET REQUEST
export const getPendingPasswordResets = async () => {
  const { data, error } = await getAllProfiles();
  return {
    data: (data || []).filter((profile: any) => !!profile.password_reset_requested),
    error,
  };
};

// CLEAR MUST CHANGE PASSWORD FLAG (current user clears their own)
export const clearMustChangePassword = async (userId: string) => {
  void userId;
  return updateProfileFields({ must_change_password: false });
};

// DELETE CHANNEL
export const deleteChannel = async (id: string) => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/channels/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? { data: body.data ?? null, error: null }
    : { data: null, error: new Error(body.error || 'Kanal silinemedi') };
};

// SAVE INVITE CODE (önceki kodları silmez — liste birikir; kullanılınca/süresi
// dolunca tarihsel kayıt olarak kalır, "kim kullandı" gösterimi için gerekli)
export const saveInviteCode = async (code: string, expiresAt: number) => {
  void getAuthPayload();
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/invite/admin/codes`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.toUpperCase(), expiresAt }),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { data: body?.data ?? null, error: null } : { data: null, error: new Error(body?.error || 'Kod kaydedilemedi') };
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
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return false;
  const res = await fetch(`${SERVER_API_URL}/auth/invite/admin/codes/${encodeURIComponent(code.toUpperCase())}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return res.ok && !!body?.ok;
};

export const listAdminInviteCodes = async (
  limit: number,
  offset: number,
): Promise<{ items: AdminInviteCodeRow[]; total: number }> => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { items: [], total: 0 };
  const res = await fetch(`${SERVER_API_URL}/auth/invite/admin/codes?limit=${limit}&offset=${offset}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Davet kodları alınamadı');
  return await res.json();
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
  const res = await fetch(`${SERVER_API_URL}/auth/invite/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return await res.json();
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
  const res = await fetch(`${SERVER_API_URL}/auth/invite/request/${encodeURIComponent(requestId)}`);
  if (!res.ok) return null;
  return await res.json();
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
  const token = getAuthToken();
  const res = await fetch(`${SERVER_API_URL}/auth/invite/admin/requests/${encodeURIComponent(requestId)}/send-code`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return await res.json();
};

// ADMIN: DAVETI REDDET
export const adminRejectInvite = async (requestId: string): Promise<{
  ok?: boolean;
  rejection_count?: number;
  blocked_until?: number | null;
  permanently_blocked?: boolean;
  error?: string;
}> => {
  const token = getAuthToken();
  const res = await fetch(`${SERVER_API_URL}/auth/invite/admin/requests/${encodeURIComponent(requestId)}/reject`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return await res.json();
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
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return [];
  const res = await fetch(`${SERVER_API_URL}/auth/invite/admin/requests`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body?.items) ? body.items : [];
};

// VERIFY INVITE CODE FOR EMAIL (email bağlamalı, anon)
export const verifyInviteCodeForEmail = async (code: string, email: string): Promise<boolean> => {
  const res = await fetch(`${SERVER_API_URL}/auth/invite/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.toUpperCase(), email }),
  });
  const body = await res.json().catch(() => ({}));
  return !!body?.ok;
};

// USE INVITE CODE FOR EMAIL (email bağlamalı, anon)
export const useInviteCodeForEmail = async (code: string, email: string): Promise<boolean> => {
  const res = await fetch(`${SERVER_API_URL}/auth/invite/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.toUpperCase(), email }),
  });
  const body = await res.json().catch(() => ({}));
  return !!body?.ok;
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
  const token = getAuthToken();
  const res = await fetch(`${SERVER_API_URL}/auth/invite/admin/requests/${encodeURIComponent(requestId)}/mark-sent`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return await res.json();
};

// ADMIN: GÖNDERIM BAŞARISIZ OLARAK İŞARETLE
export const adminMarkInviteFailed = async (requestId: string, sendError: string): Promise<{ ok?: boolean; error?: string }> => {
  const token = getAuthToken();
  const res = await fetch(`${SERVER_API_URL}/auth/invite/admin/requests/${encodeURIComponent(requestId)}/mark-failed`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: sendError }),
  });
  return await res.json();
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
  return getPendingInviteRequests() as Promise<Array<{
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
  }>>;
};

// ─── Moderatör Yönetimi ─────────────────────────────────────────────────────
export const toggleUserModerator = async (targetUserId: string, newValue: boolean) => {
  return updateUserModeration(targetUserId, { is_moderator: newValue });
};

// ─── Duyurular (Announcements) ──────────────────────────────────────────────
export const getAnnouncements = async () => {
  if (!SERVER_API_URL) return { data: [], error: new Error('VITE_SERVER_API_URL tanımlı değil') };
  const res = await fetch(`${SERVER_API_URL}/auth/announcements`);
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? { data: Array.isArray(body.data) ? body.data : [], error: null }
    : { data: [], error: new Error(body.error || 'Duyurular alınamadı') };
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
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/announcements`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(announcement),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? { data: body.data ?? null, error: null }
    : { data: null, error: new Error(body.error || 'Duyuru oluşturulamadı') };
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
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/announcements/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? { data: body.data ?? null, error: null }
    : { data: null, error: new Error(body.error || 'Duyuru güncellenemedi') };
};

export const deleteAnnouncement = async (id: string) => {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) return { data: null, error: new Error('Oturum bulunamadı') };
  const res = await fetch(`${SERVER_API_URL}/auth/announcements/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? { data: body.data ?? null, error: null }
    : { data: null, error: new Error(body.error || 'Duyuru silinemedi') };
};

// UPLOAD AVATAR — self-hosted backend uploads klasörüne yükler
export const uploadAvatar = async (userId: string, file: File): Promise<string> => {
  if (!SERVER_API_URL) throw new Error('VITE_SERVER_API_URL tanımlı değil');
  const token = getAuthToken();
  if (!token) throw new Error('Oturum bulunamadı');

  const res = await fetch(`${SERVER_API_URL}/auth/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      contentType: file.type || 'image/jpeg',
      data: await fileToBase64(file),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Fotoğraf yüklenemedi');

  const url = String(body?.url || '');
  const fullUrl = url.startsWith('http') ? url : `${SERVER_API_URL}${url}`;
  return `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
}

// UPLOAD SERVER LOGO — self-hosted backend uploads klasörüne yükler
export const uploadServerLogo = async (serverId: string, file: File): Promise<string> => {
  if (!SERVER_API_URL) throw new Error('VITE_SERVER_API_URL tanımlı değil');
  const token = getAuthToken();
  if (!token) throw new Error('Oturum bulunamadı');

  const res = await fetch(`${SERVER_API_URL}/servers/${encodeURIComponent(serverId)}/logo`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contentType: file.type || 'image/jpeg',
      data: await fileToBase64(file),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Logo yüklenemedi');

  const url = String(body?.url || '');
  const fullUrl = url.startsWith('http') ? url : `${SERVER_API_URL}${url}`;
  return `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
}

// ── Room Chat Messages ──────────────────────────────────────────────────────

/** Odanın mesajlarını getir (son 200) */
export async function fetchRoomMessages(channelId: string) {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) throw new Error('Oturum bulunamadı');
  const res = await fetch(`${SERVER_API_URL}/auth/room-messages?channelId=${encodeURIComponent(channelId)}`, {
    headers: authHeader(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Mesajlar alınamadı');
  return Array.isArray(body.data) ? body.data : [];
}

/** Mesaj gönder */
export async function sendRoomMessage(channelId: string, senderId: string, senderName: string, senderAvatar: string, text: string) {
  void senderId;
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) throw new Error('Oturum bulunamadı');
  const res = await fetch(`${SERVER_API_URL}/auth/room-messages`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId, senderName, senderAvatar, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Mesaj gönderilemedi');
}

/** Tek mesaj sil */
export async function deleteRoomMessage(messageId: string) {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) throw new Error('Oturum bulunamadı');
  const res = await fetch(`${SERVER_API_URL}/auth/room-messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Mesaj silinemedi');
}

/** Tek mesaj düzenle */
export async function updateRoomMessage(messageId: string, newText: string) {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) throw new Error('Oturum bulunamadı');
  const res = await fetch(`${SERVER_API_URL}/auth/room-messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: newText }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Mesaj düzenlenemedi');
}

/** Odanın tüm mesajlarını sil (admin/mod) */
export async function clearRoomMessages(channelId: string) {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) throw new Error('Oturum bulunamadı');
  const res = await fetch(`${SERVER_API_URL}/auth/room-messages/channel/${encodeURIComponent(channelId)}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Mesajlar temizlenemedi');
}

/** Boş odanın mesajlarını sil (5 dk sonra çağrılır) */
export async function cleanupEmptyRoomMessages(channelId: string) {
  try {
    await clearRoomMessages(channelId);
  } catch (error) {
    console.warn('Cleanup failed:', error);
  }
};

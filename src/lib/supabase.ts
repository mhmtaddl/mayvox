import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'cylk-auth-session',
  },
});

// REGISTER
export const signUp = async (email: string, password: string) => {
  return await supabase.auth.signUp({
    email,
    password,
  });
};

// LOGIN
export const signIn = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({
    email,
    password,
  });
};

// LOGOUT
export const signOut = async () => {
  return await supabase.auth.signOut();
};

// GET CURRENT USER
export const getUser = async () => {
  return await supabase.auth.getUser();
};

// GET CURRENT SESSION
export const getSession = async () => {
  return await supabase.auth.getSession();
};

// AUTH STATE LISTENER
export const onAuthStateChange = (
  callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]
) => {
  return supabase.auth.onAuthStateChange(callback);
};

// SAVE PROFILE
export const saveProfile = async (profile: {
  id: string;
  name: string;
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

// UPDATE AUTH EMAIL
export const updateUserEmail = async (email: string) => {
  return await supabase.auth.updateUser({ email });
};

// UPDATE AUTH PASSWORD
export const updateUserPassword = async (password: string) => {
  return await supabase.auth.updateUser({ password });
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
}) => {
  return await supabase.from('channels').insert(channel);
};

// UPDATE CHANNEL
export const updateChannel = async (id: string, updates: {
  name?: string;
  max_users?: number;
  is_invite_only?: boolean;
  is_hidden?: boolean;
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

// DELETE CHANNEL
export const deleteChannel = async (id: string) => {
  return await supabase.from('channels').delete().eq('id', id);
};

// SAVE INVITE CODE (eski tüm kodları siler, yeni kodu kaydeder)
export const saveInviteCode = async (code: string, expiresAt: number) => {
  const { data: { session } } = await supabase.auth.getSession();
  await supabase.from('invite_codes').delete().neq('code', '');
  return await supabase.from('invite_codes').insert({
    code: code.toUpperCase(),
    created_by: session?.user?.id,
    expires_at: expiresAt,
    used: false,
  });
};

// VERIFY INVITE CODE (kayıt öncesi anonim doğrulama)
export const verifyInviteCode = async (code: string): Promise<boolean> => {
  const { data } = await supabase.rpc('verify_invite_code', { p_code: code.toUpperCase() });
  return !!data;
};

// USE INVITE CODE (kayıt sonrası kodu geçersiz kıl)
export const useInviteCode = async (code: string): Promise<boolean> => {
  const { data } = await supabase.rpc('use_invite_code', { p_code: code.toUpperCase() });
  return !!data;
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
};
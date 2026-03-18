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

// UPDATE USER MODERATION (admin/mute/ban)
export const updateUserModeration = async (id: string, updates: {
  is_admin?: boolean;
  is_primary_admin?: boolean;
  is_muted?: boolean;
  mute_expires?: number | null;
  is_voice_banned?: boolean;
  ban_expires?: number | null;
}) => {
  return await supabase.from('profiles').update(updates).eq('id', id);
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
  password?: string | null;
}) => {
  return await supabase.from('channels').update(updates).eq('id', id);
};

// DELETE CHANNEL
export const deleteChannel = async (id: string) => {
  return await supabase.from('channels').delete().eq('id', id);
};
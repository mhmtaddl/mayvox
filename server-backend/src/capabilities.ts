/**
 * Capability constants — tek gerçek kaynak.
 * Frontend kopyası: src/lib/capabilities.ts (senkron tutulmalı).
 *
 * Kural: bu dosya DB'deki role_capabilities.capability satırlarıyla birebir uyumlu.
 * Yeni capability eklemek için:
 *  1) Buraya yeni const ekle
 *  2) Migration yaz (yeni sistem rolleri güncellemesi veya direkt mevcut rollere grant)
 *  3) Frontend kopyasını güncelle
 */
export const CAPABILITIES = {
  SERVER_VIEW: 'server.view',
  SERVER_JOIN: 'server.join',
  SERVER_MANAGE: 'server.manage',

  CHANNEL_CREATE: 'channel.create',
  CHANNEL_UPDATE: 'channel.update',
  CHANNEL_DELETE: 'channel.delete',
  CHANNEL_REORDER: 'channel.reorder',
  CHANNEL_VIEW_PRIVATE: 'channel.view_private',
  CHANNEL_JOIN_PRIVATE: 'channel.join_private',

  INVITE_CREATE: 'invite.create',
  INVITE_REVOKE: 'invite.revoke',

  MEMBER_MOVE: 'member.move',
  MEMBER_KICK: 'member.kick',
  MEMBER_MUTE: 'member.mute',
  MEMBER_TIMEOUT: 'member.timeout',
  MEMBER_ROOM_KICK: 'member.room_kick',

  ROLE_MANAGE: 'role.manage',
} as const;

export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES];

export const ALL_CAPABILITIES: readonly Capability[] = Object.values(CAPABILITIES);

/** Legacy rol adı → sistem rol adı eşlemesi (server_members.role kolonu için) */
export const LEGACY_ROLE_MAP: Record<string, string> = {
  owner: 'owner',
  admin: 'admin',
  mod: 'moderator',
  member: 'member',
};

/** Sistem rol adı → capability seti (migration backfill + seed için referans) */
export const SYSTEM_ROLE_CAPS: Record<string, Capability[]> = {
  owner: [...ALL_CAPABILITIES],
  admin: ALL_CAPABILITIES.filter(c => c !== CAPABILITIES.ROLE_MANAGE),
  moderator: [
    CAPABILITIES.SERVER_VIEW,
    CAPABILITIES.SERVER_JOIN,
    CAPABILITIES.INVITE_REVOKE,
    CAPABILITIES.MEMBER_MOVE,
    CAPABILITIES.MEMBER_KICK,
    CAPABILITIES.MEMBER_MUTE,
    CAPABILITIES.MEMBER_TIMEOUT,
    CAPABILITIES.MEMBER_ROOM_KICK,
  ],
  member: [
    CAPABILITIES.SERVER_VIEW,
    CAPABILITIES.SERVER_JOIN,
  ],
};

export const SYSTEM_ROLE_PRIORITY: Record<string, number> = {
  owner: 100,
  admin: 80,
  moderator: 60,
  member: 20,
};

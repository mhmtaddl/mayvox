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
  SERVER_MODERATION_UPDATE: 'server.moderation.update',

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
  MEMBER_CHAT_BAN: 'member.chat_ban',

  ROLE_MANAGE: 'role.manage',

  // Faz A (7-rol genişletme) — hiyerarşi-bazlı alt-rol yönetimi.
  // Semantik: bu capability'ye sahip rol, kendisinden daha düşük priority'li
  // rolleri yönetebilir (düzenle/ata/yetki değiştir). Atomic cap yeterli değil —
  // aynı zamanda canManageRole(actor, target) hierarchy guard'ı şart.
  ROLE_MANAGE_LOWER: 'role.manage.lower',
  ROLE_ASSIGN_LOWER: 'role.assign.lower',
  ROLE_PERMISSIONS_EDIT_LOWER: 'role.permissions.edit.lower',

  // Voice Activity / Insights dashboard (Sunucu Ayarları → İçgörüler sekmesi).
  // Grant: owner / super_admin / admin / super_mod. Normal üye/mod görmez.
  INSIGHTS_VIEW: 'insights.view',
} as const;

export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES];

export const ALL_CAPABILITIES: readonly Capability[] = Object.values(CAPABILITIES);

/**
 * Wire/DB rol adları artık 1-1 aynı (migration 030 sonrası roles.name 'mod').
 * LEGACY_ROLE_MAP yalnızca eski veri fallback'i için kalıyor — normalizeRole()
 * tarafındaki 'moderator' → 'mod' alias'ı ile birleşir.
 */
export const LEGACY_ROLE_MAP: Record<string, string> = {
  owner: 'owner',
  super_admin: 'super_admin',
  admin: 'admin',
  super_mod: 'super_mod',
  mod: 'mod',
  super_member: 'super_member',
  member: 'member',
  // legacy fallback — migration 030 öncesi eski satırlar
  moderator: 'mod',
};

/** Sistem rol adı → capability seti (migration backfill + seed için referans) */
export const SYSTEM_ROLE_CAPS: Record<string, Capability[]> = {
  // owner → her şey
  owner: [...ALL_CAPABILITIES],

  // super_admin → explicit list. Owner seviyesine yaklaşmasın:
  //   - server.manage YOK (identity-level ayarlar owner'a özel)
  //   - channel.delete YOK (destructive — sadece owner siler)
  //   - role.manage YOK (zaten owner-only)
  //   - role.permissions.edit.lower YOK (custom role yetki düzenleme dışarıda)
  //   - role.manage.lower + role.assign.lower VAR (alt rolleri yönetir)
  super_admin: [
    CAPABILITIES.SERVER_VIEW,
    CAPABILITIES.SERVER_JOIN,
    CAPABILITIES.SERVER_MODERATION_UPDATE,
    CAPABILITIES.CHANNEL_CREATE,
    CAPABILITIES.CHANNEL_UPDATE,
    CAPABILITIES.CHANNEL_REORDER,
    CAPABILITIES.CHANNEL_VIEW_PRIVATE,
    CAPABILITIES.CHANNEL_JOIN_PRIVATE,
    CAPABILITIES.INVITE_CREATE,
    CAPABILITIES.INVITE_REVOKE,
    CAPABILITIES.MEMBER_MOVE,
    CAPABILITIES.MEMBER_KICK,
    CAPABILITIES.MEMBER_MUTE,
    CAPABILITIES.MEMBER_TIMEOUT,
    CAPABILITIES.MEMBER_ROOM_KICK,
    CAPABILITIES.MEMBER_CHAT_BAN,
    CAPABILITIES.ROLE_MANAGE_LOWER,
    CAPABILITIES.ROLE_ASSIGN_LOWER,
    CAPABILITIES.INSIGHTS_VIEW,
  ],

  // admin → tam yönetim (sunucu + kanal + davet + moderasyon), alt-rol yönetimi
  admin: [
    CAPABILITIES.SERVER_VIEW,
    CAPABILITIES.SERVER_JOIN,
    CAPABILITIES.SERVER_MANAGE,
    CAPABILITIES.SERVER_MODERATION_UPDATE,
    CAPABILITIES.CHANNEL_CREATE,
    CAPABILITIES.CHANNEL_UPDATE,
    CAPABILITIES.CHANNEL_DELETE,
    CAPABILITIES.CHANNEL_REORDER,
    CAPABILITIES.CHANNEL_VIEW_PRIVATE,
    CAPABILITIES.CHANNEL_JOIN_PRIVATE,
    CAPABILITIES.INVITE_CREATE,
    CAPABILITIES.INVITE_REVOKE,
    CAPABILITIES.MEMBER_MOVE,
    CAPABILITIES.MEMBER_KICK,
    CAPABILITIES.MEMBER_MUTE,
    CAPABILITIES.MEMBER_TIMEOUT,
    CAPABILITIES.MEMBER_ROOM_KICK,
    CAPABILITIES.MEMBER_CHAT_BAN,
    CAPABILITIES.ROLE_MANAGE_LOWER,
    CAPABILITIES.ROLE_ASSIGN_LOWER,
    CAPABILITIES.ROLE_PERMISSIONS_EDIT_LOWER,
    CAPABILITIES.INSIGHTS_VIEW,
  ],

  // super_mod → admin eksi server.manage / channel mgmt; gelişmiş moderasyon + alt-rol ata
  super_mod: [
    CAPABILITIES.SERVER_VIEW,
    CAPABILITIES.SERVER_JOIN,
    CAPABILITIES.SERVER_MODERATION_UPDATE,
    CAPABILITIES.INVITE_CREATE,
    CAPABILITIES.INVITE_REVOKE,
    CAPABILITIES.MEMBER_MOVE,
    CAPABILITIES.MEMBER_KICK,
    CAPABILITIES.MEMBER_MUTE,
    CAPABILITIES.MEMBER_TIMEOUT,
    CAPABILITIES.MEMBER_ROOM_KICK,
    CAPABILITIES.MEMBER_CHAT_BAN,
    CAPABILITIES.ROLE_ASSIGN_LOWER,
    CAPABILITIES.INSIGHTS_VIEW,
  ],

  // mod → ses moderasyonu + davet; sunucu/rol yönetimi yok
  mod: [
    CAPABILITIES.SERVER_VIEW,
    CAPABILITIES.SERVER_JOIN,
    CAPABILITIES.SERVER_MODERATION_UPDATE,
    CAPABILITIES.INVITE_REVOKE,
    CAPABILITIES.MEMBER_MOVE,
    CAPABILITIES.MEMBER_KICK,
    CAPABILITIES.MEMBER_MUTE,
    CAPABILITIES.MEMBER_TIMEOUT,
    CAPABILITIES.MEMBER_ROOM_KICK,
    CAPABILITIES.MEMBER_CHAT_BAN,
  ],

  // super_member → member + davet oluşturma (trust level yukarısı), yönetici değil
  super_member: [
    CAPABILITIES.SERVER_VIEW,
    CAPABILITIES.SERVER_JOIN,
    CAPABILITIES.INVITE_CREATE,
  ],

  // member → temel erişim
  member: [
    CAPABILITIES.SERVER_VIEW,
    CAPABILITIES.SERVER_JOIN,
  ],
};

/**
 * Sistem rol adı → nümerik priority (DB `roles.priority` kolonu).
 * Boşluklar (90, 70, 50, 30, 10) ileride custom rol priority'lerine yer bırakır.
 * Hiyerarşi karşılaştırması için `roleHierarchy.ROLE_PRIORITY` kullanılmalıdır —
 * bu mapping sadece DB seed/backfill içindir.
 */
export const SYSTEM_ROLE_PRIORITY: Record<string, number> = {
  owner: 100,
  super_admin: 90,
  admin: 80,
  super_mod: 70,
  mod: 60,
  super_member: 30,
  member: 20,
};

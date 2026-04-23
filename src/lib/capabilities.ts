/**
 * Capability constants — frontend kopyası.
 * Backend kaynağı: server-backend/src/capabilities.ts (senkron tutulmalı).
 *
 * Not: yeni capability eklenince backend + frontend + migration birlikte güncellenir.
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

  // 7-rol genişleme — hiyerarşi-bazlı alt-rol yönetimi.
  // Bu cap'ler kapı bileti; canManageRole(actor, target) hiyerarşi guard'ı da şart.
  ROLE_MANAGE_LOWER: 'role.manage.lower',
  ROLE_ASSIGN_LOWER: 'role.assign.lower',
  ROLE_PERMISSIONS_EDIT_LOWER: 'role.permissions.edit.lower',

  // Voice aktivite içgörüleri (ServerSettings → İçgörüler sekmesi).
  // Grant: owner / super_admin / admin / super_mod.
  INSIGHTS_VIEW: 'insights.view',
} as const;

export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES];

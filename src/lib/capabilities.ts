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

/**
 * Permission Bundle Layer — Frontend
 * ───────────────────────────────────
 * Backend'de 7 sistem rolü var:
 *   owner > super_admin > admin > super_mod > mod > super_member > member
 *
 * Wire formatı (API payload + server_members.role) ile roles.name artık 1-1 aynı
 * (backend migration 030 sonrası 'moderator' → 'mod' rename).
 *
 * Bu dosya frontend'in single source of truth'u:
 *   - ServerRole type
 *   - ROLE_PRIORITY (hiyerarşi kaynağı)
 *   - ROLE_LABEL / ROLE_DESCRIPTION (human-readable)
 *   - ROLE_BUNDLES (her role ait bundle seti)
 *   - canManageRole / canAssignRole / canEditRolePermissions helpers
 *   - isKnownRole / normalizeRole / rolesActorCanManage
 *
 * Bundle = UI mental modeli (kullanıcı-dostu grup). Capability = backend gate.
 */

import { CAPABILITIES, type Capability } from './capabilities';

// ─── Core role type ─────────────────────────────────────────────

export type ServerRole =
  | 'owner'
  | 'super_admin'
  | 'admin'
  | 'super_mod'
  | 'mod'
  | 'super_member'
  | 'member';

/**
 * Hiyerarşi: yüksek sayı = yüksek yetki. Ortak kurallar için (canManageRole vb.)
 * yalnızca BU mapping kullanılır.
 */
export const ROLE_PRIORITY: Record<ServerRole, number> = {
  owner: 7,
  super_admin: 6,
  admin: 5,
  super_mod: 4,
  mod: 3,
  super_member: 2,
  member: 1,
};

/** Backward-compat alias — legacy callsite'lar için. Yeni kod ROLE_PRIORITY'ı kullansın. */
export const ROLE_HIERARCHY: Record<ServerRole, number> = ROLE_PRIORITY;

// Listeleme sırası — UI'da yukarıdan aşağı
export const ROLE_DISPLAY_ORDER: ServerRole[] = [
  'owner', 'super_admin', 'admin', 'super_mod', 'mod', 'super_member', 'member',
];

// ─── Labels ─────────────────────────────────────────────────────

export const ROLE_LABEL: Record<ServerRole, string> = {
  owner: 'Sahip',
  super_admin: 'Süper Yönetici',
  admin: 'Yönetici',
  super_mod: 'Süper Moderatör',
  mod: 'Moderatör',
  super_member: 'Süper Üye',
  member: 'Üye',
};

export const ROLE_SHORT: Record<ServerRole, string> = {
  owner: 'Tüm yetkiler',
  super_admin: 'Üst düzey yönetim',
  admin: 'Tam yönetim',
  super_mod: 'Üst düzey moderasyon',
  mod: 'Moderasyon',
  super_member: 'Güvenilen üye',
  member: 'Temel erişim',
};

export const ROLE_DESCRIPTION: Record<ServerRole, string> = {
  owner: 'Sunucunun yaratıcısı. Tüm yetkilere sahip.',
  super_admin: 'Kimlik ayarları hariç en güçlü rol.',
  admin: 'Sunucu ayarları, tam moderasyon ve alt rol yönetimi.',
  super_mod: 'Üst düzey moderasyon + davet + alt rol atama.',
  mod: 'Ses moderasyonu ve davet yönetimi.',
  super_member: 'Güvenilen üye — davet oluşturabilir.',
  member: 'Temel erişim — ses ve mesajlaşma.',
};

// ─── Role-safety helpers ────────────────────────────────────────

const KNOWN_ROLES = new Set<ServerRole>([
  'owner', 'super_admin', 'admin', 'super_mod', 'mod', 'super_member', 'member',
]);

export function isKnownRole(raw: unknown): raw is ServerRole {
  return typeof raw === 'string' && (KNOWN_ROLES as Set<string>).has(raw);
}

/**
 * Güvenli normalize. Tanınmayan/null/undefined → 'member' fallback.
 * Legacy alias: 'moderator' → 'mod' (backend migration 030 öncesi veri).
 */
export function normalizeRole(raw: unknown): ServerRole {
  if (raw === 'moderator') return 'mod';
  return isKnownRole(raw) ? raw : 'member';
}

// ─── Hierarchy guards ───────────────────────────────────────────

/**
 * actor, target'ı yönetebilir mi? (kick, ban, timeout, rol değiştir vb.)
 * Kural: actor priority > target priority, target ≠ owner, unknown → false.
 */
export function canManageRole(actorRole: unknown, targetRole: unknown): boolean {
  if (!isKnownRole(actorRole) || !isKnownRole(targetRole)) return false;
  if (targetRole === 'owner') return false;
  return ROLE_PRIORITY[actorRole] > ROLE_PRIORITY[targetRole];
}

/** actor, bu rolü atayabilir mi? (canManageRole ile aynı kural — net semantik için ayrı) */
export function canAssignRole(actorRole: unknown, targetRole: unknown): boolean {
  return canManageRole(actorRole, targetRole);
}

/** actor, bu rolün yetkilerini düzenleyebilir mi? (custom role için — şu an no-op placeholder) */
export function canEditRolePermissions(actorRole: unknown, targetRole: unknown): boolean {
  return canManageRole(actorRole, targetRole);
}

/** actor'ın yönetebildiği rollerin priority-desc listesi (UI "Yönetebildiği Roller" için) */
export function rolesActorCanManage(actorRole: unknown): ServerRole[] {
  if (!isKnownRole(actorRole)) return [];
  const out: ServerRole[] = [];
  for (const r of ROLE_DISPLAY_ORDER) {
    if (r === 'owner') continue;
    if (ROLE_PRIORITY[r] < ROLE_PRIORITY[actorRole]) out.push(r);
  }
  return out;
}

/** Eski callsite imzası — wire'a eşdeğer. Korunuyor ki var olan kod kırılmasın. */
export function canActOn(actor: ServerRole, target: ServerRole): boolean {
  return canManageRole(actor, target);
}

export function canSetRole(actor: ServerRole, next: ServerRole): boolean {
  return canAssignRole(actor, next);
}

// ─── Bundles ────────────────────────────────────────────────────

export type Bundle =
  | 'manage_server'
  | 'manage_members'
  | 'moderate_voice'
  | 'manage_invites'
  | 'read_audit'
  | 'manage_channels'
  | 'manage_roles';

export const BUNDLE_LABEL: Record<Bundle, string> = {
  manage_server: 'Sunucu Yönetimi',
  manage_members: 'Üye Yönetimi',
  moderate_voice: 'Ses Moderasyonu',
  manage_invites: 'Davet Yönetimi',
  read_audit: 'Kayıtları Görüntüleme',
  manage_channels: 'Kanal Düzenleme',
  manage_roles: 'Rol Yönetimi',
};

export const BUNDLE_HINT: Record<Bundle, string> = {
  manage_server: 'Kimlik, gizlilik ve plan ayarları',
  manage_members: 'Üye atma, rol değişikliği ve yasaklama',
  moderate_voice: 'Odada taşıma, susturma, zaman aşımı',
  manage_invites: 'Davet oluşturma, iptal ve başvuru onayı',
  read_audit: 'Denetim kayıtlarını görüntüleme',
  manage_channels: 'Kanal oluşturma, düzenleme ve erişim',
  manage_roles: 'Alt rolleri atama ve yönetme',
};

export const BUNDLE_CAPS: Record<Bundle, readonly Capability[]> = {
  manage_server: [CAPABILITIES.SERVER_MANAGE],
  manage_members: [CAPABILITIES.MEMBER_KICK, CAPABILITIES.ROLE_MANAGE],
  moderate_voice: [
    CAPABILITIES.MEMBER_MOVE,
    CAPABILITIES.MEMBER_MUTE,
    CAPABILITIES.MEMBER_TIMEOUT,
    CAPABILITIES.MEMBER_ROOM_KICK,
    CAPABILITIES.MEMBER_CHAT_BAN,
  ],
  manage_invites: [CAPABILITIES.INVITE_CREATE, CAPABILITIES.INVITE_REVOKE],
  read_audit: [],
  manage_channels: [
    CAPABILITIES.CHANNEL_CREATE,
    CAPABILITIES.CHANNEL_UPDATE,
    CAPABILITIES.CHANNEL_DELETE,
    CAPABILITIES.CHANNEL_REORDER,
  ],
  manage_roles: [
    CAPABILITIES.ROLE_MANAGE_LOWER,
    CAPABILITIES.ROLE_ASSIGN_LOWER,
  ],
};

export const BUNDLE_PARTIAL_PENDING: Record<Bundle, readonly string[]> = {
  manage_server: [],
  manage_members: [],
  moderate_voice: [],
  manage_invites: [],
  read_audit: [],
  manage_channels: ['channel.access.grant'],
  manage_roles: [],
};

/**
 * Role → bundle seti. Backend SYSTEM_ROLE_CAPS ile konseptüel uyumlu;
 * bundle granülerliği UI için özet.
 */
export const ROLE_BUNDLES: Record<ServerRole, readonly Bundle[]> = {
  owner: [
    'manage_server', 'manage_members', 'moderate_voice',
    'manage_invites', 'read_audit', 'manage_channels', 'manage_roles',
  ],
  super_admin: [
    'manage_members', 'moderate_voice',
    'manage_invites', 'read_audit', 'manage_channels', 'manage_roles',
  ],
  admin: [
    'manage_server', 'manage_members', 'moderate_voice',
    'manage_invites', 'read_audit', 'manage_channels', 'manage_roles',
  ],
  super_mod: [
    'moderate_voice', 'manage_invites', 'read_audit', 'manage_roles',
  ],
  mod: [
    'moderate_voice', 'manage_invites', 'read_audit',
  ],
  super_member: [
    'manage_invites',
  ],
  member: [],
};

export interface BundleDisplay {
  bundle: Bundle;
  label: string;
  hint: string;
  active: boolean;
  partialPending: boolean;
}

const ORDER: readonly Bundle[] = [
  'manage_server',
  'manage_members',
  'manage_roles',
  'moderate_voice',
  'manage_invites',
  'read_audit',
  'manage_channels',
];

export function bundleDisplayForRole(role: ServerRole): BundleDisplay[] {
  const active = new Set<Bundle>(ROLE_BUNDLES[role] ?? []);
  return ORDER.map(b => ({
    bundle: b,
    label: BUNDLE_LABEL[b],
    hint: BUNDLE_HINT[b],
    active: active.has(b),
    partialPending: active.has(b) && BUNDLE_PARTIAL_PENDING[b].length > 0,
  }));
}

// ─── Raw capability labels (Gelişmiş Yetkiler paneli) ───────────

export const CAP_LABEL: Record<string, string> = {
  'server.view': 'Sunucuyu gör',
  'server.join': 'Sunucuya katıl',
  'server.manage': 'Sunucu ayarları',
  'server.moderation.update': 'Moderasyon ayarları',
  'channel.create': 'Kanal oluştur',
  'channel.update': 'Kanal düzenle',
  'channel.delete': 'Kanal sil',
  'channel.reorder': 'Kanal sırala',
  'channel.view_private': 'Özel kanalları gör',
  'channel.join_private': 'Özel kanala katıl',
  'invite.create': 'Davet oluştur',
  'invite.revoke': 'Davet iptal',
  'member.move': 'Üye taşı',
  'member.kick': 'Üye at',
  'member.mute': 'Sesini sustur',
  'member.timeout': 'Zaman aşımı ver',
  'member.room_kick': 'Odadan çıkar',
  'member.chat_ban': 'Yazma engeli',
  'role.manage': 'Rol yönet (tam)',
  'role.manage.lower': 'Alt rolleri yönet',
  'role.assign.lower': 'Alt rol ata',
  'role.permissions.edit.lower': 'Alt rol yetkilerini düzenle',
};

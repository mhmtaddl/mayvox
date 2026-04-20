/**
 * Permission Bundle Layer
 * ────────────────────────
 * Backend 14 atomic capability tanımlıyor (src/lib/capabilities.ts + backend).
 * UI tarafında kullanıcı-dostu 6 gruba (bundle) indirgeniyoruz.
 *
 * Bundle = bir mental model. UI render/etiket için.
 * Capability = authoritative gate. Backend bunları kullanır.
 *
 * Role → Bundle mapping FE-static: sistem rolleri sabit olduğundan
 * 4 rol x 6 bundle matrisini hard-code tutuyoruz. Backend ayrıca her role
 * için capability listesi döndürüyor (getServerRoles); Gelişmiş Yetkiler
 * paneli o raw listeyi gösterir.
 */

import { CAPABILITIES, type Capability } from './capabilities';

export type ServerRole = 'owner' | 'admin' | 'mod' | 'member';

export type Bundle =
  | 'manage_server'
  | 'manage_members'
  | 'moderate_voice'
  | 'manage_invites'
  | 'read_audit'
  | 'manage_channels';

export const BUNDLE_LABEL: Record<Bundle, string> = {
  manage_server: 'Sunucu Yönetimi',
  manage_members: 'Üye Yönetimi',
  moderate_voice: 'Ses Moderasyonu',
  manage_invites: 'Davet Yönetimi',
  read_audit: 'Kayıtları Görüntüleme',
  manage_channels: 'Kanal Düzenleme',
};

export const BUNDLE_HINT: Record<Bundle, string> = {
  manage_server: 'Kimlik, gizlilik ve plan ayarları',
  manage_members: 'Üye atma, rol değişikliği ve yasaklama',
  moderate_voice: 'Odada taşıma, susturma, zaman aşımı',
  manage_invites: 'Davet oluşturma, iptal ve başvuru onayı',
  read_audit: 'Denetim kayıtlarını görüntüleme',
  manage_channels: 'Kanal oluşturma, düzenleme ve erişim',
};

/**
 * Bundle → backend atomic cap listesi.
 * Boş array = bundle tamamen role-based (backend atomic cap yok).
 * `read_audit` örneği: admin/mod role'u audit endpoint'ine erişebiliyor
 * ama ayrı bir capability yok; role-gate yeterli.
 */
export const BUNDLE_CAPS: Record<Bundle, readonly Capability[]> = {
  manage_server: [CAPABILITIES.SERVER_MANAGE],
  manage_members: [CAPABILITIES.MEMBER_KICK, CAPABILITIES.ROLE_MANAGE],
  moderate_voice: [CAPABILITIES.MEMBER_MOVE],
  manage_invites: [CAPABILITIES.INVITE_CREATE, CAPABILITIES.INVITE_REVOKE],
  read_audit: [],
  manage_channels: [
    CAPABILITIES.CHANNEL_CREATE,
    CAPABILITIES.CHANNEL_UPDATE,
    CAPABILITIES.CHANNEL_DELETE,
    CAPABILITIES.CHANNEL_REORDER,
  ],
};

/**
 * Bundle içinde backend tarafında hazır OLMAYAN (yakında) alt-özellikler.
 * moderate_voice → mute/timeout backend'e eklenince bu azalır.
 */
export const BUNDLE_PARTIAL_PENDING: Record<Bundle, readonly string[]> = {
  manage_server: [],
  manage_members: [],
  moderate_voice: ['member.mute', 'member.timeout'],
  manage_invites: [],
  read_audit: [],
  manage_channels: ['channel.access.grant'],
};

/**
 * Sistem rolü → sahip olduğu bundle'lar.
 * FE-static: plan doc'taki 4x6 matris.
 */
export const ROLE_BUNDLES: Record<ServerRole, readonly Bundle[]> = {
  owner: [
    'manage_server',
    'manage_members',
    'moderate_voice',
    'manage_invites',
    'read_audit',
    'manage_channels',
  ],
  admin: [
    'manage_server',
    'manage_members',
    'moderate_voice',
    'manage_invites',
    'read_audit',
    'manage_channels',
  ],
  mod: ['moderate_voice', 'manage_invites', 'read_audit'],
  member: [],
};

// UI render için düz liste — BundleDisplay satırları
export interface BundleDisplay {
  bundle: Bundle;
  label: string;
  hint: string;
  active: boolean;        // rol bu bundle'a sahip mi
  partialPending: boolean; // aktif ama içinde yakında-özellikler var mı
}

const ORDER: readonly Bundle[] = [
  'manage_server',
  'manage_members',
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

// Raw capability → Türkçe label (Gelişmiş Yetkiler paneli için)
export const CAP_LABEL: Record<string, string> = {
  'server.view': 'Sunucuyu gör',
  'server.join': 'Sunucuya katıl',
  'server.manage': 'Sunucu ayarları',
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
  'role.manage': 'Rol yönet',
};

// Rol hiyerarşisi — aksiyon yetkisi için
export const ROLE_HIERARCHY: Record<ServerRole, number> = {
  owner: 4,
  admin: 3,
  mod: 2,
  member: 1,
};

/**
 * `actor` rolündeki bir kullanıcı, `target` rolündeki bir kullanıcıya
 * rol değiştirebilir mi / kick/ban edebilir mi?
 */
export function canActOn(actor: ServerRole, target: ServerRole): boolean {
  if (target === 'owner') return false;
  return ROLE_HIERARCHY[actor] > ROLE_HIERARCHY[target];
}

/**
 * `actor` rolü, üyeyi `next` rolüne atayabilir mi?
 * Owner: admin/mod/member
 * Admin: mod/member (admin atayamaz — sadece owner)
 * Mod: hiç kimse
 * Member: hiç kimse
 */
export function canSetRole(actor: ServerRole, next: ServerRole): boolean {
  if (next === 'owner') return false; // ownership transfer ayrı flow (şu an yok)
  if (actor === 'owner') return true;
  if (actor === 'admin') return next === 'mod' || next === 'member';
  return false;
}

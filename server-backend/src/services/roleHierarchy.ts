/**
 * Role Hierarchy — tek source of truth.
 *
 * Wire/legacy format kullanıyoruz (API payload ve server_members.role).
 * Sistem rol adı ('moderator') ile wire ('mod') arasındaki dönüşüm için
 * capabilities.ts → LEGACY_ROLE_MAP / SYSTEM_TO_WIRE_ROLE kullanılır.
 *
 * Hiyerarşi (yukarıdan aşağı):
 *   owner (7) → super_admin (6) → admin (5) → super_mod (4)
 *   → mod (3) → super_member (2) → member (1)
 *
 * Kural (hepsi için aynı):
 *   - actor priority > target priority olmalı
 *   - same-level yasak
 *   - self-manage yasak (actor === target wire'ı taşıyan ayrı guard, çağıran tarafta)
 *   - target 'owner' ise daima yasak
 *   - unknown/null → safe fallback
 */

export type SystemRole =
  | 'owner'
  | 'super_admin'
  | 'admin'
  | 'super_mod'
  | 'mod'
  | 'super_member'
  | 'member';

/**
 * Wire (API / server_members.role kolonu) formatında rol priority'si.
 * Yüksek sayı = yüksek yetki. Asıl authoritative hiyerarşi buradan çözülür.
 */
export const ROLE_PRIORITY: Record<SystemRole, number> = {
  owner: 7,
  super_admin: 6,
  admin: 5,
  super_mod: 4,
  mod: 3,
  super_member: 2,
  member: 1,
};

const KNOWN_ROLES = new Set<SystemRole>([
  'owner', 'super_admin', 'admin', 'super_mod', 'mod', 'super_member', 'member',
]);

/** Tanınan wire rol mü? null/undefined/unknown string → false. */
export function isKnownRole(raw: unknown): raw is SystemRole {
  return typeof raw === 'string' && (KNOWN_ROLES as Set<string>).has(raw);
}

/**
 * Güvenli normalize: wire string'i SystemRole'e çevirir. Tanınmayan her şey
 * 'member'a düşer (legacy/bozuk veri için safe fallback). Crash etmez.
 *
 * Legacy alias: 'moderator' (DB migration 030 öncesi sistem rol adı) → 'mod'.
 */
export function normalizeRole(raw: unknown): SystemRole {
  if (raw === 'moderator') return 'mod';
  return isKnownRole(raw) ? raw : 'member';
}

/**
 * Açık fallback imzası — callsite'ta fallback rolünü override etmek gerekiyorsa.
 * Örn: membership yok → access denied için 'member' yerine throw daha uygun olabilir.
 */
export function safeRoleOrFallback(raw: unknown, fallback: SystemRole = 'member'): SystemRole {
  return isKnownRole(raw) ? raw : fallback;
}

/** Internal: priority lookup, unknown → 0 (member bile 1; 0 = kimse). */
function priorityOf(role: unknown): number {
  return isKnownRole(role) ? ROLE_PRIORITY[role] : 0;
}

/**
 * `actor` rolündeki kullanıcı, `target` rolündeki kullanıcıyı YÖNETEBİLİR mi?
 * (kick, ban, timeout, rol değiştirme, yetki düzenleme — ortak guard)
 *
 * - target 'owner' ise: hiç kimse (owner dahil, kendine uygulayamaz)
 * - actor priority target'ten yüksek değilse: false
 * - unknown/null her iki tarafta: false
 */
export function canManageRole(actorRole: unknown, targetRole: unknown): boolean {
  if (!isKnownRole(actorRole) || !isKnownRole(targetRole)) return false;
  if (targetRole === 'owner') return false;
  return ROLE_PRIORITY[actorRole] > ROLE_PRIORITY[targetRole];
}

/**
 * `actor`, bir üyeye `target` rolünü ATAYABİLİR mi?
 * Aynı kural: actor > target ve target !== 'owner'. Ownership transfer ayrı flow.
 */
export function canAssignRole(actorRole: unknown, targetRole: unknown): boolean {
  return canManageRole(actorRole, targetRole);
}

/**
 * `actor`, `target` rolünün YETKİLERİNİ değiştirebilir mi?
 * System rolleri için bu şu an no-op (sistem rolleri FE-static). Helper ileriye
 * dönük custom roller için yerinde dursun. Kural aynı.
 */
export function canEditRolePermissions(actorRole: unknown, targetRole: unknown): boolean {
  return canManageRole(actorRole, targetRole);
}

/**
 * Bir aksiyonun self-target olmadığını doğrular. Self actions (kendi rolünü
 * değiştirme, kendini atma) her zaman yasak — canManageRole'den ayrı guard
 * çünkü iki farklı userId aynı role sahip olsa bile canManageRole zaten false
 * döner (same-level yasak) ama self-guard user-facing mesaj için ayrı.
 */
export function isSelfAction(actorUserId: string, targetUserId: string): boolean {
  return actorUserId === targetUserId;
}

/**
 * Verilen `actor` rolünün yönetebileceği rollerin listesi (UI için — "Yönetebildiği
 * Roller" paneli). Kendinden düşük priority'li ve owner olmayan roller.
 */
export function rolesActorCanManage(actorRole: unknown): SystemRole[] {
  const actorPri = priorityOf(actorRole);
  if (actorPri === 0) return [];
  const out: SystemRole[] = [];
  for (const r of KNOWN_ROLES) {
    if (r === 'owner') continue;
    if (ROLE_PRIORITY[r] < actorPri) out.push(r);
  }
  // Priority desc sırala (yukarıdan aşağı okunabilir)
  out.sort((a, b) => ROLE_PRIORITY[b] - ROLE_PRIORITY[a]);
  return out;
}

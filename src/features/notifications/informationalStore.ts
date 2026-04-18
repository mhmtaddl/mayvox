/**
 * Informational notification store.
 *
 * Tanım:
 *  - "Bilgi" tipi bildirimler: tek-atımlık, kullanıcının aksiyonu gerektirmeyen
 *    ör. "X sunucusuna kabul edildin", "başvurun reddedildi", vs.
 *  - Aksiyon tipinden (friend_request, dm_unread, join_request_pending) farkı:
 *    → Kullanıcı çanı açıp baktığı an "okunmuş" sayılır ve silinir.
 *    → Aksiyon tipleri ise kaynak count sıfırlanana kadar çanda kalır.
 *
 * Kullanım:
 *   pushInformational({ key, label, detail, ... })  — yeni kayıt ekle (tekil key)
 *   clearAll()                                      — çan açılınca hepsini sil
 *   subscribe(listener)                             — değişiklikleri dinle
 *   getSnapshot()                                   — anlık liste
 *
 * Not: process içi bellek. Sayfa reload'unda silinir (bilinçli — toast'la simetrik davranış).
 */

export type InformationalKind = 'joinRequestAccepted' | 'joinRequestRejected' | 'serverRestricted' | 'serverUnrestricted' | 'missedCall' | 'generic';

export interface InformationalItem {
  /** Tekil anahtar — aynı key gelirse mevcut item güncellenir (duplicate engeli). */
  key: string;
  kind: InformationalKind;
  label: string;
  detail: string;
  /** Bildirime tıklanınca açılacak sunucu — opsiyonel. */
  serverId?: string;
  serverAvatar?: string | null;
  createdAt: number;
}

let items: InformationalItem[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    try { l(); } catch { /* no-op */ }
  }
}

export function pushInformational(item: InformationalItem): void {
  const idx = items.findIndex(i => i.key === item.key);
  if (idx >= 0) {
    // Aynı key — en güncel veriyi yaz, başa taşı.
    items = [item, ...items.filter(i => i.key !== item.key)];
  } else {
    items = [item, ...items];
  }
  // Hard cap: kötü niyetli/spam event'lere karşı üst limit.
  if (items.length > 50) items = items.slice(0, 50);
  emit();
}

export function clearAllInformational(): void {
  if (items.length === 0) return;
  items = [];
  emit();
}

export function removeInformational(key: string): void {
  const next = items.filter(i => i.key !== key);
  if (next.length === items.length) return;
  items = next;
  emit();
}

export function getInformationalSnapshot(): InformationalItem[] {
  return items;
}

export function subscribeInformational(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

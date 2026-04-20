# Changelog

MAYVOX için tüm önemli değişiklikler bu dosyada tutulur.

Eski sürüm notları: https://github.com/mhmtaddl/mayvox/releases

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) · [Semver](https://semver.org/lang/tr/).

## [2.0.10] — 2026-04-20

### Sunucu Ayarları Paneli — Premium Yeniden Tasarım

Sunucu ayarları sistemi uçtan uca yenilendi. Modal overlay kaldırıldı, artık
orta panelde **inline** render ediliyor. Tüm sekmeler premium glassmorphism
tasarım diline taşındı. Mevcut servis çağrıları birebir korundu — backward
compatible.

### Eklenenler

- **Genel sekmesi**: glassmorphism kartlar, 8pt grid spacing, segmented
  toggle (Görünürlük/Katılım), Apple-vari primary/danger butonlar, adres
  kopyalama Check feedback, kaydedilmemiş değişiklikler bar'ı.
- **Roller ve Yetkiler**: 3 rol kartı (Yönetici/Moderatör/Üye) + Sahip bandı
  + 6 yetki grubu (bundle) sistemi + varsayılan gizli **Gelişmiş Yetkiler**
  paneli (raw capability listesi).
- **Üyeler sekmesi**: kebab menü (⋯) + rol seçici popover + ban/kick
  onay modal'ları (ban'de zorunlu sebep), satır bazlı busy state'ler,
  muted badge okuma yolu, rol hiyerarşisi tabanlı capability guard'ları.
- **Moderasyon sekmesi (yeni)**: 3 bölümlü tek panel — Yasaklılar (unban
  aksiyonu), Aktif Cezalar (muted kullanıcılar + yakında timeout/room kick
  placeholder'ları), Geçmiş İşlemler (gerçek audit log, filtered).
- **Davetler sekmesi**: artık Başvurular sekmesi de bu sekmenin altında
  (Davet Linkleri / Gönderilen / Başvurular sub-segmented), pending sayısı
  sekme başlığında rozet.
- **Denetim sekmesi**: tone-coded satırlar (ban kırmızı, unban yeşil, kick
  turuncu, role mavi, invite mor), actor/hedef/sebep arama, 4 filtre chip'i
  (Hepsi/Moderasyon/Roller/Davetler), severity dot sistemi.
- **Özet sekmesi**: "Aktif Moderasyon" insight kartı (yasaklı/susturulma
  sayıları + son moderation event), plan bölümü 3 büyük karttan tek
  satırlık compact özet'e düşürüldü.

### Değişenler

- ServerSettings artık orta panele gömülü (fixed modal overlay kaldırıldı).
- Sekme yapısı 8 → 7: `Başvurular` ve `Yasaklar` tab'ları kaldırıldı,
  sırasıyla `Davetler` ve `Moderasyon` içine merge edildi.
- Legacy `initialTab='bans'` → `'moderation'`, `initialTab='requests'` →
  `'invites'` + Başvurular sub-section olarak redirect ediliyor (backward
  compat shim).
- `InvitesTab`'ta davet sub-tab durumu ServerSettings'e lifted edildi:
  kullanıcı sekmeler arası gezdikten sonra seçim korunuyor.
- Premium moderasyon state taksonomisi: 6 bundle mapping (Sunucu
  Yönetimi / Üye Yönetimi / Ses Moderasyonu / Davet Yönetimi / Kayıtları
  Görüntüleme / Kanal Düzenleme). Backend'de olmayan alt-özellikler
  "kısmi" / "yakında" rozetleriyle gösteriliyor.

### Düzeltilenler

- `GeneralTab` sunucu silme butonu: hata durumunda `deleting` state
  kilitli kalıyordu (`try/finally` ile düzeltildi).
- `GeneralTab` kaydet butonu: beklenmeyen hata senaryosunda defensive
  `try/finally`.
- `MembersTab` boş liste mesajı: rol filtresi aktif olmadığında yanlışlıkla
  "Bu rolde üye yok" gösteriyordu, artık durumlara göre ayrışıyor
  (search / filter / default için 3 ayrı metin).
- `MembersTab` rol chip hover: disabled hallerinde kullanıcıya neden
  erişemediği hint title olarak gösteriliyor.

### Kaldırılanlar (dead code)

- `src/components/server/settings/BansTab.tsx` (Moderasyon'a merge).
- `src/components/server/settings/InviteLinksTab.tsx` (hiç kullanılmıyordu).
- `src/components/server/settings/UpgradeHint.tsx` (sadece
  InviteLinksTab tarafından import ediliyordu).
- `shared.tsx` içinde kullanılmayan `Sec` ve `PlanFeature` helper'ları.
- `ModerationTab`'da kullanılmayan `AlertCircle`, `Sparkles`, `useUser`
  importları.

### Teknik

- Yeni paylaşımlı helper: `shared.tsx::timeAgo(iso, { withDateFallback? })`.
  Önceki 3 duplicate implementasyon (AuditTab / ModerationTab / OverviewTab)
  tek noktaya konsolide edildi.
- Yeni modül: `src/lib/permissionBundles.ts` — 6 bundle mapping, role
  hiyerarşisi (`ROLE_HIERARCHY`), yetki guard'ları (`canActOn`,
  `canSetRole`).
- Yeni component'ler: `ActionMenu`, `RolePicker`, `ConfirmModal` — portal
  tabanlı, outside click + ESC + scroll auto-close.
- Backend servis imzaları değişmedi: `kickMember`, `changeRole`,
  `banMember`, `unbanMember`, `getBans`, `getMembers`, `getServerRoles`,
  `getAuditLog`, `getServerOverview`, `getInvites`, `createInvite`,
  `deleteInvite`, `listJoinRequests`, `acceptJoinRequest`,
  `rejectJoinRequest`, `sendServerInvite`, `getSentInvites`,
  `cancelSentInvite` — hepsi aynı sözleşmede.
- TypeScript: redesign kapsamındaki dosyalarda 0 hata. Pre-existing 7 hata
  (MessageText, DMPanel, AccountSection, AdminActionBar, avatarFrame) bu
  sürümün kapsamı dışında.

### Bilinenler / Henüz

- Server-scoped voice mute / timeout / oda çıkarma backend endpoint'leri
  henüz yok. UI bu aksiyonları Moderasyon sekmesinde "yakında" durumunda
  gösteriyor. Backend endpoint eklendikten sonra tek satırlık flag
  değişikliğiyle canlıya alınabilir.

---

Önceki sürümler için GitHub releases sayfasına bakın.

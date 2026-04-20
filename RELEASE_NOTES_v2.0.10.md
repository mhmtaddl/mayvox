# MAYVOX v2.0.10 — Yönetim Paneli Baştan Tasarlandı

Sunucu ayarları sisteminin uçtan uca yenilenmesi. Daha hızlı, daha net,
daha premium. Topluluklar tek bir sekmede moderasyon, üye yönetimi ve
davet akışlarını yönetebiliyor.

## Öne Çıkanlar

### ⚙️ Ayarlar orta panelde
Sunucu ayarları artık modal pencere olarak değil, doğrudan orta panelde
açılıyor. Geçişler hızlandı, dikkatinizi dağıtmıyor.

### 👥 Üyeler — kebab menü + rol seçici
Satır başına üç nokta menüsü (⋯): rol değiştir, sunucudan at, yasakla,
yakında gelecek moderasyon aksiyonları. Rol chip'e tıklayınca açılan mini
seçici ile 1 saniyede rol atama.

### 🛡 Roller ve Yetkiler
4 sabit rol: **Sahip**, **Yönetici**, **Moderatör**, **Üye**. Her rolün
yetkileri 6 grup halinde kartlarda. Gelişmiş yetki listesi varsayılan
gizli, ihtiyaç duyunca açılır.

### ⚖ Moderasyon paneli
Yasaklılar, aktif cezalar ve geçmiş işlemler artık tek sekmede. Yasağı
kaldırma, muted kullanıcıları görme, son ne yapıldığını takip etme hepsi
aynı yerde.

### ✉️ Davetler birleşti
Davet linkleri, gönderdiğin davetler ve katılım başvuruları tek sekme
altında üç bölüm. Bekleyen başvuru sayısı sekme başlığında rozet olarak
görünüyor.

### 📜 Denetim kayıtları yenilendi
Her olay türüne özel renk kodu (ban kırmızı, unban yeşil, kick turuncu,
rol mavi, davet mor). Kişi, hedef veya sebep ile arama. 4 kategori filtre.

### 📊 Özet sekmesi sadeleşti
"Aktif Moderasyon" kartı eklendi — sunucunun durumunu tek bakışta görün.
Plan bölümü tek satırlık compact özete düştü.

## Düzeltmeler

- Sunucu silme butonu hata durumunda kilitleniyordu, düzeltildi.
- Üye listesi boş olduğunda gösterilen metin duruma göre doğru
  biçimleniyor.
- Ban/kick confirmation modal'ları artık kick için basit onay, ban için
  sebep zorunlu.
- UI tutarsızlıkları (spacing, renk, icon dili) baştan sona uyumlandı.

## Geliştirici Notları

- `src/components/server/settings/` dizini baştan organize edildi: 12
  dosya, organik paylaşımlı primitives (`shared.tsx`).
- `permissionBundles.ts` ile yeni bundle katmanı (6 bundle → backend 14
  atomic capability).
- Portal tabanlı popover/modal altyapısı (outside-click + ESC + scroll
  auto-close).
- Legacy tab ID'leri (`'bans'`, `'requests'`) alias shim ile otomatik
  yönlendiriliyor — eski caller'lar kırılmadı.
- Backend servis sözleşmeleri (kick/ban/role/invite/audit) değişmedi.
- Dead code temizliği: 304 satır kaldırıldı. Kod tabanı daha sade.
- TypeScript: yeni/değişen dosyalarda 0 hata.

## Bilinen Sınırlamalar

- Server-scoped voice mute, timeout ve oda çıkarma backend endpoint'leri
  henüz yok. UI bu aksiyonları "yakında" durumunda gösteriyor.

## Güncelleme

- **Desktop**: otomatik güncelleme etkin (electron-updater).
- **Android**: Play Store veya GitHub APK.

## Teşekkürler

Bütün test eden ve geri bildirim verenlere. Sıradaki hedef: plan
sistemi aktivasyonu ve voice moderation endpoint'leri.
